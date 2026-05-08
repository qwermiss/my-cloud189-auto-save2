const got = require('got');
const ConfigService = require('./ConfigService');

class ShareLinkParser {
    constructor() {
        this.cloud189BaseUrl = 'https://cloud.189.cn';
    }

    async parseShareLink(shareLink, password = '') {
        try {
            const shareId = this._extractShareId(shareLink);
            
            if (!shareId) {
                throw new Error('无效的分享链接');
            }

            const basicInfo = await this._fetchShareInfo(shareId, password);
            
            return {
                success: true,
                shareId,
                shareLink,
                resourceName: basicInfo.fileName || basicInfo.folderName || '未识别资源',
                resourceType: basicInfo.isFolder ? 'folder' : 'file',
                fileSize: basicInfo.fileSize || 0,
                fileCount: basicInfo.fileCount || 1,
                needPassword: basicInfo.needPassword || false,
                owner: basicInfo.owner || '未知',
                createTime: basicInfo.createTime || null,
                expireTime: basicInfo.expireTime || null
            };

        } catch (error) {
            console.error('解析分享链接失败:', error);
            return {
                success: false,
                shareLink,
                error: error.message
            };
        }
    }

    _extractShareId(shareLink) {
        const patterns = [
            /cloud\.189\.cn\/t\/([a-zA-Z0-9]+)/i,
            /cloud\.189\.cn\/web\/share\?code=([a-zA-Z0-9]+)/i,
            /\/t\/([a-zA-Z0-9]+)/i
        ];

        for (const pattern of patterns) {
            const match = shareLink.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        return null;
    }

    async _fetchShareInfo(shareId, password) {
        try {
            const account = await this._getDefaultAccount();
            
            if (!account) {
                return {
                    fileName: '需要账号才能解析',
                    needPassword: false
                };
            }

            const response = await got.post(`${this.cloud189BaseUrl}/portal/openapi/getShareInfo.action`, {
                searchParams: {
                    shareId: shareId,
                    sharePwd: password || ''
                },
                headers: {
                    'Cookie': account.cookie || ''
                },
                responseType: 'json',
                timeout: 10000
            });

            if (response.body.res_code) {
                throw new Error(response.body.res_message || '获取分享信息失败');
            }

            const data = response.body.shareInfo || {};
            
            return {
                fileName: data.fileName,
                folderName: data.folderName,
                isFolder: data.isFolder || false,
                fileSize: data.fileSize || 0,
                fileCount: data.fileCount || 1,
                needPassword: data.needPwd === '1',
                owner: data.account || data.owner,
                createTime: data.createTime,
                expireTime: data.expireTime
            };

        } catch (error) {
            console.error('获取分享信息失败:', error);
            
            return {
                fileName: this._guessResourceName(shareId),
                needPassword: false
            };
        }
    }

    async _getDefaultAccount() {
        try {
            const Account = require('../entities').Account;
            const account = await Account.findOne({
                where: { status: 'active' },
                order: [['id', 'ASC']]
            });
            return account;
        } catch (error) {
            return null;
        }
    }

    _guessResourceName(shareId) {
        return `资源_${shareId}`;
    }

    validateShareLink(shareLink) {
        const pattern = /^https?:\/\/cloud\.189\.cn\/(t\/|web\/share\?code=)[a-zA-Z0-9]+/i;
        return pattern.test(shareLink);
    }
}

class ShareLinkParserWithTMDB extends ShareLinkParser {
    constructor() {
        super();
        this.tmdb = require('./tmdb');
    }

    async parseShareLink(shareLink, password = '') {
        const basicResult = await super.parseShareLink(shareLink, password);
        
        if (!basicResult.success) {
            return basicResult;
        }

        const resourceName = basicResult.resourceName;
        
        try {
            const tmdbResult = await this._searchTMDB(resourceName);
            
            if (tmdbResult) {
                basicResult.tmdbInfo = tmdbResult;
                basicResult.suggestedPath = this._generateSuggestedPath(tmdbResult);
                basicResult.videoType = tmdbResult.type;
            }
        } catch (error) {
            console.error('TMDB查询失败:', error);
        }

        return basicResult;
    }

    async _searchTMDB(resourceName) {
        const cleanName = this._cleanResourceName(resourceName);
        
        const movieResult = await this.tmdb.searchMovie(cleanName);
        const tvResult = await this.tmdb.searchTV(cleanName);

        const movieScore = movieResult && movieResult.results && movieResult.results.length > 0 
            ? movieResult.results[0].popularity || 0 
            : 0;
        const tvScore = tvResult && tvResult.results && tvResult.results.length > 0 
            ? tvResult.results[0].popularity || 0 
            : 0;

        if (movieScore > tvScore && movieResult.results.length > 0) {
            const movie = movieResult.results[0];
            return {
                type: 'movie',
                id: movie.id,
                title: movie.title,
                originalTitle: movie.original_title,
                year: movie.release_date ? new Date(movie.release_date).getFullYear() : null,
                overview: movie.overview,
                poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
                rating: movie.vote_average,
                popularity: movie.popularity
            };
        } else if (tvResult && tvResult.results && tvResult.results.length > 0) {
            const tv = tvResult.results[0];
            return {
                type: 'tv',
                id: tv.id,
                title: tv.name,
                originalTitle: tv.original_name,
                year: tv.first_air_date ? new Date(tv.first_air_date).getFullYear() : null,
                overview: tv.overview,
                poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : null,
                rating: tv.vote_average,
                popularity: tv.popularity
            };
        }

        return null;
    }

    _cleanResourceName(name) {
        return name
            .replace(/\[[^\]]+\]/g, '')
            .replace(/【[^】]+】/g, '')
            .replace(/\([^)]+\)/g, '')
            .replace(/第[一二三四五六七八九十\d]+季/gi, '')
            .replace(/S\d+/gi, '')
            .replace(/Season\s*\d+/gi, '')
            .replace(/[\._]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    _generateSuggestedPath(tmdbInfo) {
        const basePath = ConfigService.getConfigValue('tasks.defaultTargetPath') || '/media/';
        
        const cleanTitle = tmdbInfo.title.replace(/[\/\\]/g, ' ').trim();
        
        if (tmdbInfo.type === 'movie') {
            if (tmdbInfo.year) {
                return `${basePath}电影/${cleanTitle} (${tmdbInfo.year})/`;
            }
            return `${basePath}电影/${cleanTitle}/`;
        } else {
            if (tmdbInfo.year) {
                return `${basePath}电视剧/${cleanTitle} (${tmdbInfo.year})/`;
            }
            return `${basePath}电视剧/${cleanTitle}/`;
        }
    }
}

module.exports = {
    ShareLinkParser,
    ShareLinkParserWithTMDB
};

class TaskCompleteEventDto  {
    constructor(data) {
        this.cloud189 = data?.cloud189;
        this.task = data?.task;
        this.fileList = data?.fileList;
        this.overwriteStrm = data?.overwriteStrm;
        this.taskService = data?.taskService;
        this.taskRepo = data?.taskRepo;
        this.firstExecution = data?.firstExecution;
        this.existingFiles = data?.existingFiles;
        this.actualNewCount = data?.actualNewCount || 0; // 智能去重场景的实际新增数量
    }
}

module.exports = { TaskCompleteEventDto };

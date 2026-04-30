// 导航切换
function initTabs() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            // Remove active from all items
            document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Add active to clicked item
            item.classList.add('active');
            
            // Activate corresponding tab
            const tabId = item.dataset.tab + 'Tab';
            const tabElement = document.getElementById(tabId);
            if(tabElement) {
                tabElement.classList.add('active');
            }

            // Handle sub-tab scrolling in Settings
            if (item.dataset.subTab && tabId === 'settingsTab') {
                const subTabs = {
                    'basic': 0,
                    'transfer': 2, // Settings card index
                    'media-settings': 5,
                    'notification-settings': 4,
                    'tools': 3
                };
                // Simply scroll to top for now, we can refine this later if needed
                document.querySelector('.page-container').scrollTop = 0; 
            }
        });
    });
}
async function fetchStats() {
    try {
        const res = await fetch('/api/monitor/stats');
        const data = await res.json();

        document.getElementById('stat-images').innerText = data.total_images.toLocaleString();
        document.getElementById('stat-origin').innerText = data.origin_images.toLocaleString();
        document.getElementById('stat-active').innerText = data.running_jobs;
        document.getElementById('stat-done').innerText = data.job_stats.DONE || 0;

        renderSiteCards(data.sites);

        const runBtn = document.getElementById('run-btn');
        if (data.running_jobs > 0) {
            runBtn.disabled = true;
            runBtn.innerText = "CRAWLER RUNNING...";
            document.querySelector('.monitor-section').classList.add('scanning');
        } else {
            runBtn.disabled = false;
            runBtn.innerText = "START CRAWLING";
            document.querySelector('.monitor-section').classList.remove('scanning');
        }
    } catch (e) {
        console.error("Stats fetch error", e);
    }
}

function renderSiteCards(sites) {
    const grid = document.getElementById('site-grid');
    grid.innerHTML = sites.map(site => `
        <div class="site-card ${site.status === 'RUNNING' ? 'running' : ''}">
            <div class="site-header">
                <span class="site-name">${site.name}</span>
                <span class="site-indicator"></span>
            </div>
            <div class="site-body">
                <div class="site-stat">
                    <span class="label">Images Found</span>
                    <span class="value">${site.images}</span>
                </div>
                <div class="site-status-text">${site.status}</div>
            </div>
        </div>
    `).join('');
}

async function fetchLiveImages() {
    try {
        const res = await fetch('/api/monitor/live-images');
        const images = await res.json();

        const gallery = document.getElementById('live-gallery');
        if (images.length === 0) {
            gallery.innerHTML = '<div class="empty-msg">No images collected yet</div>';
            return;
        }

        gallery.innerHTML = images.map(img => `
            <div class="live-image-card">
                <img src="${img.url}" loading="lazy" alt="Live Discovery">
            </div>
        `).join('');
    } catch (e) {
        console.error("Live images fetch error", e);
    }
}

async function fetchLogs() {
    try {
        const res = await fetch('/api/monitor/logs');
        const logs = await res.json();

        const terminal = document.getElementById('log-terminal');
        const isAtBottom = terminal.scrollHeight - terminal.clientHeight <= terminal.scrollTop + 1;

        terminal.innerHTML = logs.map(log => {
            let className = 'log-info';
            if (log.includes('[ERROR]')) className = 'log-error';
            if (log.includes('[WARNING]')) className = 'log-warn';

            // Takedown Flow 실시간 시각화 매핑
            updateFlowUI(log);

            return `<div class="log-entry ${className}">${log}</div>`;
        }).join('');

        if (isAtBottom) {
            terminal.scrollTop = terminal.scrollHeight;
        }
    } catch (e) {
        console.error("Logs fetch error", e);
    }
}

async function startCrawl() {
    const runBtn = document.getElementById('run-btn');
    runBtn.disabled = true;
    runBtn.innerText = "STARTING...";

    try {
        await fetch('/api/monitor/run-now', { method: 'POST' });
    } catch (e) {
        console.error("Start crawl failed", e);
    }
}


const LOG_TO_STAGE = {
    '[TAKEDOWN][GEN][삭제 대상 정리부]': { id: 'stage-gen-clean', module: 'mod-gen' },
    '[TAKEDOWN][GEN][요청 방식 결정부]': { id: 'stage-gen-decide', module: 'mod-gen' },
    '[TAKEDOWN][GEN][삭제 요청 생성부]': { id: 'stage-gen-create', module: 'mod-gen' },
    '[TAKEDOWN][TRACK][상태 확인 스케줄 실행부]': { id: 'stage-track-sched', module: 'mod-track' },
    '[TAKEDOWN][TRACK][삭제 요청 상태 조회부]': { id: 'stage-track-query', module: 'mod-track' },
    '[TAKEDOWN][TRACK][상태 판정부]': { id: 'stage-track-judge', module: 'mod-track' },
    '[TAKEDOWN][NOTI][결과 정리부]': { id: 'stage-noti-clean', module: 'mod-noti' },
    '[TAKEDOWN][NOTI][사용자 알림 생성부]': { id: 'stage-noti-msg', module: 'mod-noti' },
    '[TAKEDOWN][NOTI][알림 전송 관리부]': { id: 'stage-noti-queue', module: 'mod-noti' }
};

const activeTasks = new Map(); // targetUrl -> { element, lastStage }

function updateFlowUI(log) {
    // URL 추출 시도: [TARGET:...]
    const targetMatch = log.match(/\[TARGET:([^\]]+)\]/);
    const targetUrl = targetMatch ? targetMatch[1] : null;

    for (const [pattern, info] of Object.entries(LOG_TO_STAGE)) {
        if (log.includes(pattern)) {
            const el = document.getElementById(info.id);
            if (el) {
                // 단계 하이라이트
                el.classList.add('active');
                el.closest('.flow-module').classList.add('active');

                // 작업 객체(Sprite) 이동 처리
                if (targetUrl) {
                    moveTaskSprite(targetUrl, info);
                }

                setTimeout(() => {
                    el.classList.remove('active');
                    if (!el.closest('.flow-module').querySelector('.stage.active')) {
                        el.closest('.flow-module').classList.remove('active');
                    }
                }, 3000);
            }
        }
    }
}

function moveTaskSprite(url, stageInfo) {
    let task = activeTasks.get(url);
    const layer = document.getElementById('task-sprite-layer');
    const stageEl = document.getElementById(stageInfo.id);
    const canvas = document.getElementById('flow-canvas');

    if (!task) {
        // 새 작업 생성
        const el = document.createElement('div');
        el.className = 'task-sprite';
        el.innerHTML = `
            <div class="status">PROCESSING</div>
            <div class="info">${url.split('/').pop()}</div>
            <div class="info" style="font-size: 8px; opacity: 0.5;">${url}</div>
        `;
        layer.appendChild(el);

        // 초기 위치 (캔버스 왼쪽 밖)
        el.style.left = "-150px";
        el.style.top = "50%";

        task = { element: el, currentStage: null };
        activeTasks.set(url, task);

        // 등장 효과
        setTimeout(() => el.classList.add('visible'), 50);
    }

    // 대상 स्टेज의 좌표 계산
    const canvasRect = canvas.getBoundingClientRect();
    const stageRect = stageEl.getBoundingClientRect();

    const targetX = stageRect.left - canvasRect.left + (stageRect.width / 2) - 60; // 60 is half width
    const targetY = stageRect.top - canvasRect.top + (stageRect.height / 2);

    // 이동 및 동작 상태 표현
    task.element.style.left = `${targetX}px`;
    task.element.style.top = `${targetY}px`;
    task.element.classList.add('working');

    // 동작 메시지 갱신
    task.element.querySelector('.status').innerText = stageEl.innerText;

    // 작업 완료 후 정지 효과 (시연용)
    setTimeout(() => {
        task.element.classList.remove('working');
    }, 1500);

    // 마지막 단계면 제거
    if (stageInfo.id === 'stage-noti-queue' || stageInfo.id === 'stage-track-judge') {
        setTimeout(() => {
            task.element.classList.remove('visible');
            setTimeout(() => {
                task.element.remove();
                activeTasks.delete(url);
            }, 1000);
        }, 5000);
    }
}

// Initial fetch
fetchStats();
fetchLogs();
fetchLiveImages();

// Polling
setInterval(fetchStats, 2000);
setInterval(fetchLogs, 1000);
setInterval(fetchLiveImages, 3000);

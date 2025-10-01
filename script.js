document.addEventListener('DOMContentLoaded', function() {
    const LOCAL_STORAGE_KEY = 'vaultOSState_v2.6';

    // --- State Management ---
    let state = {
        tasks: { '1': false, '2': false, '3': false, '4': false },
        decisionLog: [],
        parkingLot: []
    };

    function loadState() {
        const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedState) {
            state = JSON.parse(savedState);
        }
    }

    function saveState() {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    }

    // --- UI Elements ---
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const taskCheckboxes = document.querySelectorAll('#p0-tasks input[type="checkbox"]');
    const decisionLogEl = document.getElementById('decision-log');
    const parkingLotEl = document.getElementById('parking-lot');

    // --- Initial Render ---
    function renderAll() {
        updateProgressBar();
        renderLogs();
        applyTaskState();
    }
    
    // --- Progress Bar Logic ---
    function updateProgressBar() {
        const totalTasks = taskCheckboxes.length;
        const completedTasks = Object.values(state.tasks).filter(Boolean).length;
        const percentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
        progressBar.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}% (${completedTasks}/${totalTasks})`;
    }

    function handleTaskChange(e) {
        const taskId = e.target.dataset.id;
        state.tasks[taskId] = e.target.checked;
        saveState();
        updateProgressBar();
    }
    
    function applyTaskState() {
        taskCheckboxes.forEach(checkbox => {
            const taskId = checkbox.dataset.id;
            if(state.tasks[taskId]) {
                checkbox.checked = true;
            }
        });
    }

    // --- Logging Logic ---
    function renderLogs() {
        decisionLogEl.innerHTML = state.decisionLog.map(log => `
            <li class="p-2 bg-gray-800 rounded-md break-words">
                <span class="font-bold ${log.decision === '[채택]' ? 'text-green-400' : 'text-yellow-400'}">${log.decision}</span>: 
                ${escapeHTML(log.idea)} <span class="text-xs text-gray-500 block">${log.timestamp}</span>
            </li>
        `).join('') || '<li class="text-gray-500 text-xs text-center">결정된 아이디어가 없습니다.</li>';
        parkingLotEl.innerHTML = state.parkingLot.map(log => `
            <li class="p-2 bg-gray-800 rounded-md break-words">
                <span class="font-bold text-red-400">[폐기]</span>: 
                ${escapeHTML(log.idea)} <span class="text-xs text-gray-500 block">${log.timestamp}</span>
            </li>
        `).join('') || '<li class="text-gray-500 text-xs text-center">보류된 아이디어가 없습니다.</li>';
    }
    
    window.logDecision = function(type) {
        const inputEl = document.getElementById(`${type}-input`);
        const outputEl = document.getElementById(`${type}-output`);
        
        const ideaText = inputEl.value.trim();
        const outputText = outputEl.value.trim();

        if (!outputText || !ideaText) {
            alert('아이디어와 검토 결과를 모두 입력해주세요.');
            return;
        }

        const decisionMatch = outputText.match(/\*\*-\s*최종\s*결정:\*\*\s*(\[.*?\])/);
        const decision = decisionMatch ? decisionMatch[1] : null;

        if (!decision) {
             alert('결과에서 최종 결정을 찾을 수 없습니다. (형식: **- 최종 결정:** [채택])');
            return;
        }

        const logEntry = {
            idea: ideaText,
            decision: decision,
            timestamp: new Date().toLocaleString()
        };

        if (decision === '[채택]' || decision === '[수정 후 채택]') {
            state.decisionLog.unshift(logEntry);
        } else if (decision === '[폐기]') {
            state.parkingLot.unshift(logEntry);
        }
        
        saveState();
        renderLogs();
        inputEl.value = '';
        outputEl.value = '';
    }

    // --- Prompt Copy Logic (UPGRADED) ---
    window.copyPrompt = async function(type) {
        const inputEl = document.getElementById(`${type}-input`);
        const promptFileName = `${type}_prompt.md`;

        try {
            const [constitutionRes, promptRes] = await Promise.all([
                fetch('PROJECT_CONSTITUTION_v2.0.md'),
                fetch(promptFileName)
            ]);

            if (!constitutionRes.ok) throw new Error('PROJECT_CONSTITUTION_v2.0.md 파일을 찾을 수 없습니다.');
            if (!promptRes.ok) throw new Error(`${promptFileName} 파일을 찾을 수 없습니다.`);

            const constitutionText = await constitutionRes.text();
            let promptText = await promptRes.text();
            
            promptText = promptText.replace("[여기에 'PROJECT_CONSTITUTION_v2.0.md' 파일의 전체 내용을 붙여넣으십시오]", constitutionText);

            if (type === 'co-ceo') {
                promptText = promptText.replace("{CEO가 검토를 요청하는 새로운 아이디어}", inputEl.value.trim());
            } else if (type === 'pm') {
                 promptText = promptText.replace("{Co-CEO가 [채택]한 기능 아이디어}", inputEl.value.trim());
            } else if (type === 'engineer') {
                 promptText = promptText.replace("{PM이 작성한 '신규 기능 상세 명세서' 전문}", inputEl.value.trim());
            }

            await navigator.clipboard.writeText(promptText);
            alert(`${type.toUpperCase()} 프롬프트가 클립보드에 복사되었습니다.`);

        } catch (err) {
            console.error('Copy failed', err);
            alert(`프롬프트 복사 오류: ${err.message}. 관련 파일들이 index.html과 같은 폴더에 있는지 확인하세요.`);
        }
    }
    
    // --- Workflow Logic ---
    window.finalizeBlueprint = function() {
        const pmOutputEl = document.getElementById('pm-output');
        const engineerInputEl = document.getElementById('engineer-input');
        
        const blueprintText = pmOutputEl.value.trim();
        if (!blueprintText) {
            alert('PM 상세 명세서 내용이 없습니다.');
            return;
        }
        
        engineerInputEl.value = blueprintText;
        
        // Switch to engineer tab
        const engineerTabButton = document.querySelector('button[data-tab="engineer"]');
        engineerTabButton.click();
        
        alert('설계도가 Engineer에게 전달되었습니다. Engineer 탭으로 이동합니다.');
    }


    // --- Tab Logic ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;

            tabButtons.forEach(btn => {
                btn.classList.remove('border-indigo-500', 'text-white');
                btn.classList.add('border-transparent', 'text-gray-400');
            });
            button.classList.add('border-indigo-500', 'text-white');
            button.classList.remove('border-transparent', 'text-gray-400');
            
            tabContents.forEach(content => {
                if (content.id === `${tabId}-tab`) {
                    content.classList.remove('hidden');
                    content.classList.add('active');
                } else {
                    content.classList.add('hidden');
                    content.classList.remove('active');
                }
            });
        });
    });
    
    // --- Modal Logic ---
    const swotButton = document.getElementById('swot-button');
    const swotModal = document.getElementById('swot-modal');
    const closeSwotModal = document.getElementById('close-swot-modal');
    
    swotButton.addEventListener('click', () => {
        swotModal.classList.remove('hidden');
        swotModal.classList.add('flex');
    });

    closeSwotModal.addEventListener('click', () => {
        swotModal.classList.add('hidden');
        swotModal.classList.remove('flex');
    });

    swotModal.addEventListener('click', (e) => {
        if(e.target === swotModal) {
            swotModal.classList.add('hidden');
            swotModal.classList.remove('flex');
        }
    });

    // --- Utility Functions ---
    function escapeHTML(str) {
        const p = document.createElement("p");
        p.textContent = str;
        return p.innerHTML;
    }

    // --- Event Listeners ---
    taskCheckboxes.forEach(checkbox => checkbox.addEventListener('change', handleTaskChange));

    // --- App Initialization ---
    loadState();
    renderAll();
});


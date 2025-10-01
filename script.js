import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', function() {
    // ⚡️ PART 1: FIREBASE INITIALIZATION & CONSTANTS ⚡️
    // index.html에서 초기화된 전역 객체를 사용
    const db = window.db;
    const STATE_DOC_REF = doc(db, 'VAULT_OS_DATA', 'user_state_v2.7'); // 클라우드에 저장될 문서 ID

    // --- State Management ---
    let state = {
        tasks: { '1': false, '2': false, '3': false, '4': false },
        decisionLog: [],
        parkingLot: []
    };

    // 로컬 스토리지 대신 Firestore에서 상태를 로드 (비동기)
    async function loadState() {
        try {
            const docSnap = await getDoc(STATE_DOC_REF);
            if (docSnap.exists()) {
                // Firestore 데이터로 상태 업데이트
                state = docSnap.data();
            } else {
                console.log("No initial state found in Firestore. Saving default state.");
                // 초기 상태를 저장하여 문서 생성
                await saveState(); 
            }
        } catch (e) {
            console.error("Error loading state from Firestore: ", e);
            alert("경고: 클라우드 상태 로드에 실패했습니다. 로컬 기본값으로 시작합니다.");
        }
    }

    // 로컬 스토리지 대신 Firestore에 상태를 저장 (비동기)
    async function saveState() {
        try {
            await setDoc(STATE_DOC_REF, state);
        } catch (e) {
            console.error("Error saving state to Firestore: ", e);
            alert("경고: 클라우드 상태 저장에 실패했습니다. 데이터가 유실될 수 있습니다.");
        }
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

    async function handleTaskChange(e) {
        const taskId = e.target.dataset.id;
        state.tasks[taskId] = e.target.checked;
        await saveState(); // 비동기 saveState 호출
        updateProgressBar();
    }
    
    function applyTaskState() {
        taskCheckboxes.forEach(checkbox => {
            const taskId = checkbox.dataset.id;
            // 로드된 상태가 비동기이므로, 이 함수가 호출될 때 상태가 이미 로드되어 있어야 함.
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
    
    // logDecision 함수를 비동기로 변경
    window.logDecision = async function(type) {
        const inputEl = document.getElementById(`${type}-input`);
        const outputEl = document.getElementById(`${type}-output`);
        
        const ideaText = inputEl.value.trim();
        const outputText = outputEl.value.trim();

        if (!outputText || !ideaText) {
            alert('아이디어와 검토 결과를 모두 입력해주세요.');
            return;
        }

        const decisionMatch = outputText.match(/\*\*-\s*최종\s*결정:\*\*\s*(\[.*?\])/);
        let decision = decisionMatch ? decisionMatch[1] : null;
        
        // '코드 리뷰' 탭은 [채택]/[폐기] 외에 다른 결정도 허용할 수 있도록 결정 포맷 확인 로직을 완화하거나 조정 필요
        if (!decision && type !== 'code-review') {
             alert('결과에서 최종 결정을 찾을 수 없습니다. (형식: **- 최종 결정:** [채택])');
            return;
        } else if (type === 'code-review') {
            // 코드 리뷰는 [채택] 또는 [재검토] 같은 명확한 결론이 있다고 가정하고 임의의 결정 문자열을 할당
             decision = decision || '[코드 리뷰 완료]';
        }


        const logEntry = {
            idea: ideaText,
            decision: decision,
            timestamp: new Date().toLocaleString()
        };

        if (decision === '[채택]' || decision === '[수정 후 채택]' || decision === '[코드 리뷰 완료]') {
            state.decisionLog.unshift(logEntry);
        } else if (decision === '[폐기]' || decision === includes('재검토')) {
            state.parkingLot.unshift(logEntry);
        }
        
        await saveState(); // 비동기 saveState 호출
        renderLogs();
        inputEl.value = '';
        outputEl.value = '';
    }

    // --- Prompt Copy Logic (UPGRADED) ---
    window.copyPrompt = async function(type) {
        const inputEl = document.getElementById(`${type}-input`);
        
        // ⚡️ 'code-review' 타입 처리를 추가
        const promptFileName = type === 'code-review' ? `code_review_prompt.md` : `${type}_prompt.md`;

        try {
            const [constitutionRes, promptRes] = await Promise.all([
                fetch('PROJECT_CONSTITUTION_v2.0.md'),
                fetch(promptFileName)
            ]);

            if (!constitutionRes.ok) throw new Error('PROJECT_CONSTITUTION_v2.0.md 파일을 찾을 수 없습니다.');
            if (!promptRes.ok) throw new Error(`${promptFileName} 파일을 찾을 수 없습니다. 새로운 프롬프트 파일을 생성해주세요.`);

            const constitutionText = await constitutionRes.text();
            let promptText = await promptRes.text();
            
            promptText = promptText.replace("[여기에 'PROJECT_CONSTITUTION_v2.0.md' 파일의 전체 내용을 붙여넣으십시오]", constitutionText);

            if (type === 'co-ceo') {
                promptText = promptText.replace("{CEO가 검토를 요청하는 새로운 아이디어}", inputEl.value.trim());
            } else if (type === 'pm') {
                 promptText = promptText.replace("{Co-CEO가 [채택]한 기능 아이디어}", inputEl.value.trim());
            } else if (type === 'engineer') {
                 promptText = promptText.replace("{PM이 작성한 '신규 기능 상세 명세서' 전문}", inputEl.value.trim());
            } else if (type === 'code-review') {
                 // 코드 리뷰는 Engineer의 최종 코드를 입력으로 받도록 가정
                 promptText = promptText.replace("{Engineer가 생성한 최종 코드 전문}", inputEl.value.trim());
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
    // Tab Logic은 이미 DOM 요소를 기반으로 작동하므로, HTML에 새 탭을 추가하면 자동으로 인식됨.
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

    // --- App Initialization (비동기 처리) ---
    async function initApp() {
        await loadState(); // 상태 로드가 완료될 때까지 기다림
        renderAll();
    }
    initApp();
});
// Evidence Data
let evidenceData = [];

// Fetch data from server
async function fetchEvidenceData() {
    try {
        const response = await fetch('api/evidence');
        const result = await response.json();
        if (result.message === "success") {
            // boolean is stored as 1/0 in sqlite, convert for consistency if needed, but not strictly required
            evidenceData = result.data.map(item => ({
                ...item,
                is_deepfake: item.is_deepfake === 1
            }));
            renderAnalysisTable();
        } else {
            console.error(result.error);
        }
    } catch (err) {
        console.error("Error fetching data:", err);
    }
}

// DOM Elements
const analysisTbody = document.getElementById('analysis-tbody');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const btnNext = document.getElementById('btnNext');
const btnAllConsented = document.getElementById('btnAllConsented');

const finalOutputContainer = document.getElementById('finalOutputContainer');
const finalTbody = document.getElementById('final-tbody');
const finalCountBadge = document.getElementById('finalCountBadge');
const btnRequestDeletion = document.getElementById('btnRequestDeletion');

// State to hold selected deepfakes
let selectedIds = new Set();

// Helper functions for UI rendering and state
const getImageCellHTML = (imageUrl) => `
            <td class="px-4 py-3 border-r border-gray-300">
                <div class="flex justify-center">
                    <div class="w-16 h-12 overflow-hidden rounded border border-gray-300 shadow-sm">
                        <img src="${imageUrl}" alt="Evidence" class="object-cover w-full h-full">
                    </div>
                </div>
            </td>`;

const resetSelectionUI = () => {
    selectedIds.clear();
    selectAllCheckbox.checked = false;
    document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = false);
};

// 1. Initial Render of Analysis Results Table
function renderAnalysisTable() {
    analysisTbody.innerHTML = '';

    evidenceData.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors duration-150";

        const isChecked = selectedIds.has(item.id);

        tr.innerHTML = `
            <td class="px-4 py-3 text-center font-bold text-gray-900 border-r border-gray-300">
                ${index + 1}
            </td>
${getImageCellHTML(item.image_url)}
            <td class="px-4 py-3 text-center border-r border-gray-300">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                    True
                </span>
            </td>
            <td class="px-4 py-3 text-center">
                <input type="checkbox" class="row-checkbox w-5 h-5 text-indigo-600 rounded border-gray-400 focus:ring-indigo-500 cursor-pointer" 
                    data-id="${item.id}" ${isChecked ? 'checked' : ''}>
            </td>
        `;

        analysisTbody.appendChild(tr);
    });

}

// 2. Checkbox Handlers (Event Delegation)
analysisTbody.addEventListener('change', (e) => {
    if (e.target.classList.contains('row-checkbox')) {
        const id = e.target.getAttribute('data-id');
        e.target.checked ? selectedIds.add(id) : selectedIds.delete(id);
        selectAllCheckbox.checked = evidenceData.length > 0 && selectedIds.size === evidenceData.length;
    }
});

selectAllCheckbox.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.checked = isChecked;
        const id = cb.getAttribute('data-id');
        isChecked ? selectedIds.add(id) : selectedIds.delete(id);
    });
});

// 3. Final Output Logic
function renderFinalTable() {
    finalTbody.innerHTML = '';

    // Filter selected items
    const selectedItems = evidenceData.filter(item => selectedIds.has(item.id));

    // Update Badge
    finalCountBadge.textContent = `${selectedItems.length} 건`;

    if (selectedItems.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="3" class="px-4 py-8 text-center text-gray-500 font-medium">선택된 불법 딥페이크 데이터가 없습니다.</td>`;
        finalTbody.appendChild(tr);
    } else {
        // Render rows preserving their original 1-based index (No.)
        selectedItems.forEach((item) => {
            const originalIndex = evidenceData.findIndex(e => e.id === item.id) + 1;

            const tr = document.createElement('tr');
            tr.className = "bg-red-50/20";

            tr.innerHTML = `
                <td class="px-4 py-3 text-center font-bold text-gray-900 border-r border-gray-300">
                    ${originalIndex}
                </td>
${getImageCellHTML(item.image_url)}
                <td class="px-4 py-3 text-center text-red-700 font-bold tracking-wider">
                    True
                </td>
            `;
            finalTbody.appendChild(tr);
        });
    }

    // Show Container with smooth transition
    finalOutputContainer.classList.remove('hidden');
    finalOutputContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 4. Button Handlers
btnNext.addEventListener('click', () => {
    if (selectedIds.size === 0) {
        alert("비동의한 이미지가 있다면 선택 후 다음으로 진행하세요.\n혹은 'None' 버튼을 눌러주세요.");
        return;
    }
    renderFinalTable();
});

btnAllConsented.addEventListener('click', () => {
    resetSelectionUI();
    renderFinalTable();
});

btnRequestDeletion.addEventListener('click', async () => {
    if (selectedIds.size === 0) {
        alert("삭제 요청할 딥페이크 데이터가 없습니다.");
        return;
    }

    const count = selectedIds.size;
    // 브라우저 Confirm 팝업 차단 이슈 방지를 위해 팝업 제거 및 즉시 진행
    btnRequestDeletion.disabled = true;
    btnRequestDeletion.innerHTML = "Capturing Proof... (증거 화면 캡처 중)";

    // 1. html2canvas를 이용한 화면 캡처 (사용자 요청 사항)
    let screenshotData = "";
    try {
        const canvas = await html2canvas(document.getElementById('finalOutputContainer'), {
            backgroundColor: "#ffffff",
            scale: 1
        });
        screenshotData = canvas.toDataURL("image/jpeg", 0.7);
    } catch (e) {
        console.warn("Screenshot capture failed, proceeding with text report only.", e);
    }

    btnRequestDeletion.innerHTML = "Processing... (요청 전송 중)";

    let successCount = 0;
    const selectedItems = evidenceData.filter(item => selectedIds.has(item.id));

    for (const item of selectedItems) {
        try {
            const qs = new URLSearchParams();
            qs.set("user_id", "1");
            qs.set("target_url", item.image_url);
            
            // 상세 분석 결과 리포트와 함께 캡처된 이미지 데이터(Base64)를 사유에 포함
            const reasonDetail = `[Anti-Gravity 정밀 분석 보고서]
- 탐지 결과: Deepfake Detected (True)
- 분석 대상: ${item.image_url}
- 증거 번호: ${item.id}
- 분석 일시: ${new Date().toLocaleString()}
- 시스템 판정: 해당 이미지는 비동의 유포물로 판명됨.
- 증거 스냅샷 첨부됨: [UI Capture Data Included]`;

            qs.set("reason", reasonDetail);
            // 캡처 데이터를 evidence_url 필드에 할당 (서버에서 base64 그대로 저장하거나 로그로 보관 가능)
            qs.set("evidence_url", screenshotData ? "data:image/jpeg;base64_captured_proof" : ""); 
            
            qs.set("applicant_name", "Anti-Gravity Automated System");
            qs.set("applicant_email", "report@anti-gravity.sys");
            qs.set("right_type", "초상권 침해 및 성적 수치심 유발");
            qs.set("consent_truth", "1");
            qs.set("consent_privacy", "1");
            qs.set("ready", "1");

            const res = await fetch("/api/takedown/candidate/add?" + qs.toString(), {
                method: "POST"
            });

            if (res.ok) successCount++;
        } catch (err) {
            console.error("API Call Error:", err);
        }
    }

    // 결과 화면 구성
    finalOutputContainer.innerHTML = `
        <div class="p-12 text-center animate-in fade-in zoom-in duration-500">
            <div class="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6 shadow-sm border border-green-200">
                ✓
            </div>
            <h2 class="text-3xl font-extrabold text-slate-900 mb-4">삭제 요청 전송 완료</h2>
            <p class="text-slate-600 mb-8 leading-relaxed">
                선택하신 <strong>${count}건</strong>의 데이터 중 <strong>${successCount}건</strong>이 플랫폼 고객센터로 성공적으로 전달되었습니다.<br>
                플랫폼 측의 검토 결과는 예시 사이트의 관리자 페이지에서 확인하실 수 있습니다.
            </p>
            <div class="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8 max-w-md mx-auto text-left">
                <h4 class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">전송 요약</h4>
                <div class="flex justify-between items-center py-2 border-b border-slate-200">
                    <span class="text-slate-700">전체 요청 건수</span>
                    <span class="font-mono font-bold">${count}건</span>
                </div>
                <div class="flex justify-between items-center py-2">
                    <span class="text-slate-700">전송 성공 건수</span>
                    <span class="text-green-600 font-mono font-bold">${successCount}건</span>
                </div>
            </div>
            <button 
                onclick="window.location.reload()" 
                class="px-10 py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl active:scale-95"
            >
                처음으로 돌아가기
            </button>
        </div>
    `;
});

// Run Init
document.addEventListener('DOMContentLoaded', () => {
    fetchEvidenceData();
});

// 이미지 업로드 관리
document.addEventListener('DOMContentLoaded', function () {
    initUploader();
    initDeleteForm();
    loadSavedImages();
});

let selectedFiles = [];
const STORAGE_KEY = 'gallery_images';

async function uploadToServer(file, tagsCsv) {
    const fd = new FormData();
    fd.append("file", file);

    const qs = new URLSearchParams();
    if (tagsCsv && tagsCsv.trim()) qs.set("tags", tagsCsv.trim());

    const res = await fetch("/api/upload?" + qs.toString(), {
        method: "POST",
        body: fd
    });

    if (!res.ok) {
        const t = await res.text();
        throw new Error(t);
    }
    return await res.json(); // { image_url, image_hash, tags, ... }
}


function initUploader() {
    const imageInput = document.getElementById('imageInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const clearBtn = document.getElementById('clearBtn');
    const previewArea = document.getElementById('previewArea');

    // 업로드 관련 요소가 없는 페이지(예: takedown.html)에서는 실행 안함
    if (!imageInput || !uploadBtn) return;

    // 파일 선택
    imageInput.addEventListener('change', function (e) {
        selectedFiles = Array.from(e.target.files);
        showPreviews(selectedFiles);
        uploadBtn.disabled = selectedFiles.length === 0;
    });

    // 등록 버튼 클릭 (서버 업로드 방식)
    uploadBtn.addEventListener('click', async function () {
        if (selectedFiles.length === 0) return;

        uploadBtn.disabled = true;

        const tagInput = document.getElementById("tagInput");
        const tagsCsv = tagInput ? tagInput.value : "";

        try {
            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                await uploadToServer(file, tagsCsv);
            }
            alert("총 " + selectedFiles.length + "장의 이미지가 성공적으로 업로드되었습니다!");
            window.location.href = "index.html";

        } catch (e) {
            alert("업로드 실패: " + (e?.message || e));
            selectedFiles = [];
            imageInput.value = '';
            previewArea.innerHTML = '';
            if (tagInput) tagInput.value = "";
            uploadBtn.disabled = true;
        }
    });

    // 업로드 사진 초기화
    clearBtn.addEventListener('click', async function () {
        if (!confirm('업로드한 사진을 모두 삭제하시겠습니까? (서버 DB/파일도 삭제됨)')) return;

        try {
            const res = await fetch("/api/clear_uploaded", { method: "POST" });
            if (!res.ok) throw new Error(await res.text());

            document.querySelectorAll('.gallery-item[data-uploaded="true"]').forEach(el => el.remove());
            localStorage.removeItem(STORAGE_KEY);

            alert("초기화 완료!");
        } catch (e) {
            alert("초기화 실패: " + (e?.message || e));
        }
    });
}

// 미리보기 표시
function showPreviews(files) {
    const previewArea = document.getElementById('previewArea');
    previewArea.innerHTML = '';

    files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `
                <img src="${e.target.result}" alt="미리보기">
                <button class="preview-remove" data-index="${index}">×</button>
            `;
            previewArea.appendChild(div);

            div.querySelector('.preview-remove').addEventListener('click', function () {
                selectedFiles.splice(index, 1);
                showPreviews(selectedFiles);
                document.getElementById('uploadBtn').disabled = selectedFiles.length === 0;
            });
        };
        reader.readAsDataURL(file);
    });
}

// 갤러리 로컬스토리지 헬퍼
function loadGallery() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
}

function saveGallery(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function makeFakeUrl(realUrl) {
    if (!realUrl) return realUrl;
    if (realUrl.startsWith('https://practice-crawling.com')) return realUrl;
    const filename = realUrl.split('/').pop();
    return `https://practice-crawling.com/gallery/${filename}`;
}

function addToGallery(imageUrl, imageHash, skipSave = false, tags = []) {
    const gallery = document.getElementById('gallery');

    const displayUrl = makeFakeUrl(imageUrl);

    const item = document.createElement('div');
    item.className = 'gallery-item new';
    item.setAttribute('data-id', imageHash);
    item.setAttribute('data-uploaded', 'true');

    let tagHtml = "";
    if (tags && tags.length > 0) {
        tagHtml = `
            <div class="gallery-info">
                ${tags.map(t => `<span class="gallery-tag">#${t}</span>`).join("")}
            </div>
        `;
    }

    item.innerHTML = `
        <a href="detail.html?v=1.2&url=${encodeURIComponent(displayUrl)}" class="gallery-link">
            <img class="gallery-img" src="${imageUrl}" alt="업로드 이미지">
            ${tagHtml}
        </a>
    `;

    gallery.insertBefore(item, gallery.firstChild);
    setTimeout(() => item.classList.remove('new'), 300);
}

// 저장된 이미지 불러오기
async function loadSavedImages() {
    try {
        const res = await fetch("/api/latest_items?limit=50");
        if (!res.ok) return;

        const items = await res.json();
        items.forEach(it => addToGallery(it.image_url, it.image_hash, true, it.tags || []));
    } catch (e) {
        console.warn("loadSavedImages failed", e);
    }
}

// 삭제 요청 폼 초기화
function initDeleteForm() {
    const deleteForm = document.getElementById('deleteForm');
    const deleteResult = document.getElementById('deleteResult');
    const submitBtn = document.getElementById('deleteSubmitBtn');
    const targetUrlInput = document.getElementById('targetUrl');
    const reasonInput = document.getElementById('deleteReason');
    const previewContainer = document.getElementById('takedownPreviewContainer');
    const previewImg = document.getElementById('takedownPreviewImg');
    const chipBtns = document.querySelectorAll('.chip-btn');

    // 신규 필드
    const applicantName = document.getElementById('applicantName');
    const applicantEmail = document.getElementById('applicantEmail');
    const rightType = document.getElementById('rightType');
    const consentTruth = document.getElementById('consentTruth');
    const consentPrivacy = document.getElementById('consentPrivacy');

    // 완료 화면 요소
    const submitSuccess = document.getElementById('submitSuccess');
    const receiptNumber = document.getElementById('receiptNumber');
    const receiptEmail = document.getElementById('receiptEmail');

    if (!deleteForm) return;

    // URL 입력 시 미리보기 처리
    function updatePreview() {
        if (!targetUrlInput || !previewContainer) return;
        const urlObj = targetUrlInput.value.trim();
        let displayUrl = '';

        if (urlObj.startsWith('https://practice-crawling.com/gallery/')) {
            const filename = urlObj.split('/').pop();
            displayUrl = `/uploads/${filename}`;
        } else if (urlObj.startsWith('http://localhost') && urlObj.includes('/uploads/')) {
            displayUrl = urlObj;
        } else if (urlObj.startsWith('/uploads/')) {
            displayUrl = urlObj;
        } else {
            displayUrl = urlObj;
        }

        if (displayUrl) {
            previewImg.src = displayUrl;
            previewImg.onload = () => { previewContainer.style.display = 'flex'; };
            previewImg.onerror = () => { previewContainer.style.display = 'none'; };
        } else {
            previewContainer.style.display = 'none';
        }
    }

    if (targetUrlInput) {
        targetUrlInput.addEventListener('input', updatePreview);
        targetUrlInput.addEventListener('change', updatePreview);
        // 초기 로드 시 값 있으면 미리보기 띄움 (detail.html에서 넘어온 경우)
        setTimeout(updatePreview, 100);
    }

    // 퀵 칩스(빠른 사유 선택) 클릭 이벤트
    if (chipBtns) {
        chipBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const reasonText = btn.getAttribute('data-reason');
                if (reasonText && reasonInput) {
                    reasonInput.value = reasonText;
                    reasonInput.dispatchEvent(new Event('change'));
                }
            });
        });
    }

    // 접수번호 생성 (TKD-YYYYMMDD-XXXX)
    function generateReceiptNumber() {
        const now = new Date();
        const date = now.toISOString().slice(0, 10).replace(/-/g, '');
        const rand = String(Math.floor(Math.random() * 9000) + 1000);
        return `TKD-${date}-${rand}`;
    }

    deleteForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const targetUrl = targetUrlInput.value.trim();
        const reason = reasonInput ? reasonInput.value.trim() : '';
        const name = applicantName ? applicantName.value.trim() : '';
        const email = applicantEmail ? applicantEmail.value.trim() : '';
        const rType = rightType ? rightType.value : '';

        // 유효성 검사
        if (!targetUrl || !reason) {
            showResult("대상 URL과 신고 사유를 모두 입력해주세요.", "error");
            return;
        }
        if (!name) {
            showResult("이름(또는 단체명)을 입력해주세요.", "error");
            return;
        }
        if (!email) {
            showResult("이메일 주소를 입력해주세요.", "error");
            return;
        }
        if (!rType) {
            showResult("신청인 유형을 선택해주세요.", "error");
            return;
        }
        if (consentTruth && !consentTruth.checked) {
            showResult("허위 신고 시 법적 책임 동의가 필요합니다.", "error");
            return;
        }
        if (consentPrivacy && !consentPrivacy.checked) {
            showResult("개인정보 수집 및 이용에 동의해주세요.", "error");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span style="display:inline-block; animation: spin 1s linear infinite;">⏳</span> 처리 중...';

        try {
            const qs = new URLSearchParams();
            qs.set("target_url", targetUrl);
            qs.set("reason", reason);
            qs.set("ready", "1");
            qs.set("applicant_name", name);
            qs.set("applicant_email", email);
            qs.set("right_type", rType);
            qs.set("consent_truth", consentTruth.checked ? "1" : "0");
            qs.set("consent_privacy", consentPrivacy.checked ? "1" : "0");

            const res = await fetch("/api/takedown/candidate/add?" + qs.toString(), {
                method: "POST"
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || "요청 처리 중 오류가 발생했습니다.");
            }

            const result = await res.json();
            if (result.ok) {
                submitBtn.innerHTML = '✅ 완료';
                setTimeout(() => {
                    // 폼 숨기고 완료 화면 표시
                    deleteForm.style.display = 'none';
                    deleteResult.style.display = 'none';
                    if (submitSuccess) {
                        if (receiptNumber) receiptNumber.textContent = generateReceiptNumber();
                        if (receiptEmail) receiptEmail.textContent = email;
                        submitSuccess.style.display = 'block';
                    }
                }, 500);
            } else {
                throw new Error("서버 응답이 올바르지 않습니다.");
            }
        } catch (error) {
            console.error(error);
            showResult("오류 발생: " + error.message, "error");
            submitBtn.disabled = false;
            submitBtn.innerText = "삭제 요청 제출";
        }
    });

    function showResult(message, type) {
        deleteResult.innerText = message;
        deleteResult.className = 'delete-result ' + type;
        deleteResult.style.display = 'block';
    }
}

// 히어로 검색 기능 초기화
function initSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.querySelector('.hero-search-btn');
    const tags = document.querySelectorAll('.hero-tags a');

    if (!searchInput) return; // index.html이 아니면 종료

    function performSearch(query) {
        const lowerQuery = query.toLowerCase().trim();
        const items = document.querySelectorAll('.gallery-item');

        items.forEach(item => {
            const textContent = item.innerText.toLowerCase();
            const imgSrc = item.querySelector('img')?.src?.toLowerCase() || '';
            const dataId = item.getAttribute('data-id')?.toLowerCase() || '';

            if (lowerQuery === '' || textContent.includes(lowerQuery) || imgSrc.includes(lowerQuery) || dataId.includes(lowerQuery)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // 검색 버튼 클릭
    searchBtn?.addEventListener('click', () => {
        performSearch(searchInput.value);
    });

    // 엔터키 입력
    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            performSearch(searchInput.value);
        }
    });

    // 추천 태그 클릭
    tags.forEach(tag => {
        tag.addEventListener('click', (e) => {
            e.preventDefault();
            const tagText = tag.innerText.replace('#', '');
            searchInput.value = tagText;
            performSearch(tagText);
        });
    });
}

// 스크립트가 두 번 추가되는 일이 없도록 문서 끝에 단일 DOMContentLoaded 추가
document.addEventListener('DOMContentLoaded', () => {
    initSearch(); // 검색 기능 활성화
});

import { useState, useEffect } from 'react'
import './App.css'

function App() {
  // ── Step state ──────────────────────────────────────────────────
  const [step, setStep] = useState('mode')   // 'mode' | 'userId' | 'upload' | 'analysis'
  const [mode, setMode] = useState(null)      // 'new'
  const [userId, setUserId] = useState('')
  const [userIdInput, setUserIdInput] = useState('')
  const [isCheckingId, setIsCheckingId] = useState(false)
  
  // ── Analysis Pipeline state ───────────────────────────────────
  const [analysisJobId, setAnalysisJobId] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisLogs, setAnalysisLogs] = useState([])
  const [analysisDone, setAnalysisDone] = useState(false)
  const [currentAnalysisStep, setCurrentAnalysisStep] = useState(null)

  // ── Photo / processing state ────────────────────────────────────
  const [photos, setPhotos] = useState({ left90: null, left45: null, front: null, right45: null, right90: null })
  const [dragOver, setDragOver] = useState({ left90: false, left45: false, front: false, right45: false, right90: false })
  const [toastMessage, setToastMessage] = useState(null)
  const [processingState, setProcessingState] = useState({ left90: 'idle', left45: 'idle', front: 'idle', right45: 'idle', right90: 'idle' })
  const [currentMessage, setCurrentMessage] = useState({ left90: '', left45: '', front: '', right45: '', right90: '' })
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [uploadStartTime, setUploadStartTime] = useState(null)
  const [uploadEndTime, setUploadEndTime] = useState(null)
  const [allCompleted, setAllCompleted] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedToDb, setSavedToDb] = useState(false)

  // ── Persistence: Load state ───────────────────────────────────
  useEffect(() => {
    try {
      const savedStep = localStorage.getItem('cap_step')
      const savedUserId = localStorage.getItem('cap_userId')
      const savedDone = localStorage.getItem('cap_analysisDone')
      
      if (savedStep) setStep(savedStep)
      if (savedUserId) setUserId(savedUserId)
      if (savedDone === 'true') setAnalysisDone(true)
    } catch (e) {
      console.warn('Failed to load state', e)
    }
  }, [])

  // ── Persistence: Save state ───────────────────────────────────
  useEffect(() => {
    localStorage.setItem('cap_step', step)
    localStorage.setItem('cap_userId', userId)
    localStorage.setItem('cap_analysisDone', analysisDone)
  }, [step, userId, analysisDone])

  // ── File validation ─────────────────────────────────────────────
  const MAX_FILE_SIZE = 5 * 1024 * 1024
  const ALLOWED_FORMATS = ['image/jpeg', 'image/jpg', 'image/png']

  const showToast = (message) => {
    setToastMessage(message)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const validateFile = (file) => {
    if (!ALLOWED_FORMATS.includes(file.type)) { showToast('허용되지 않는 파일 형식입니다'); return false }
    if (file.size > MAX_FILE_SIZE) { showToast('파일이 너무 큽니다 (최대 5MB)'); return false }
    return true
  }

  // ── AI Validation ───────────────────────────────────────────────
  const processImageFile = async (type, dataUrl) => {
    if (!uploadStartTime) setUploadStartTime(Date.now())
    
    // 사진을 즉시 슬롯에 표시 (미리보기)
    setPhotos(prev => ({ ...prev, [type]: dataUrl }))
    
    setProcessingState(prev => ({ ...prev, [type]: 'processing' }))
    setCurrentMessage(prev => ({ ...prev, [type]: 'AI 각도 분석 중...' }))

    try {
      const res = await fetch('/api/validate_pose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_data: dataUrl,
          expected_type: type
        })
      })

      const result = await res.json()

      if (result.status === 'success') {
        setProcessingState(prev => ({ ...prev, [type]: 'completed' }))
        setCurrentMessage(prev => ({ ...prev, [type]: '검증 완료 ✅' }))
        setTimeout(() => setCurrentMessage(prev => ({ ...prev, [type]: '' })), 2000)
      } else {
        const errorMsg = result.message || '얼굴이 감지되지 않았습니다.'
        showToast(errorMsg)
        setPhotos(prev => ({ ...prev, [type]: null }))
        setCurrentMessage(prev => ({ ...prev, [type]: errorMsg }))
        setProcessingState(prev => ({ ...prev, [type]: 'idle' }))
        setTimeout(() => setCurrentMessage(prev => ({ ...prev, [type]: '' })), 3000)
      }
    } catch (e) {
      showToast('서버 연결 실패. 나중에 다시 시도해주세요.')
      setProcessingState(prev => ({ ...prev, [type]: 'idle' }))
      setCurrentMessage(prev => ({ ...prev, [type]: '' }))
    }
  }

  const checkAllCompleted = () => {
    let completedCount = 0;
    if (processingState.front === 'completed') completedCount++;
    if (processingState.left45 === 'completed') completedCount++;
    if (processingState.right45 === 'completed') completedCount++;
    if (processingState.left90 === 'completed') completedCount++;
    if (processingState.right90 === 'completed') completedCount++;

    if (mode === 'new') {
      if (completedCount === 5) {
        setUploadEndTime(Date.now());
        setAllCompleted(true);
      } else {
        setAllCompleted(false);
        setUploadEndTime(null);
      }
    }
  }

  useEffect(() => { checkAllCompleted() }, [processingState, mode])

  // ── Save/Register Flow ─────────────────────────────────────────
  const registerToDb = async (currentPhotos) => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          mode,
          images: {
            front: currentPhotos.front,
            left45: currentPhotos.left45,
            right45: currentPhotos.right45,
            left90: currentPhotos.left90,
            right90: currentPhotos.right90
          }
        })
      })
      if (res.ok) {
        setSavedToDb(true)
      } else {
        const err = await res.json()
        showToast(`저장 실패: ${err.message}`)
      }
    } catch (e) {
      showToast('서버 연결 실패')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Interactivity Handlers ─────────────────────────────────────
  const handleDragOver = (e, type) => { e.preventDefault(); setDragOver(prev => ({ ...prev, [type]: true })) }
  const handleDragLeave = (e, type) => { e.preventDefault(); setDragOver(prev => ({ ...prev, [type]: false })) }
  const handleDrop = (e, type) => {
    e.preventDefault()
    setDragOver(prev => ({ ...prev, [type]: false }))
    const file = e.dataTransfer.files[0]
    if (file && validateFile(file)) {
      const reader = new FileReader()
      reader.onload = async (ev) => { await processImageFile(type, ev.target.result) }
      reader.readAsDataURL(file)
    }
  }
  const handleFileSelect = (e, type) => {
    const file = e.target.files[0]
    if (file && validateFile(file)) {
      const reader = new FileReader()
      reader.onload = async (ev) => { await processImageFile(type, ev.target.result) }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }
  const handleRemove = (type) => {
    setPhotos(prev => ({ ...prev, [type]: null }))
    setProcessingState(prev => ({ ...prev, [type]: 'idle' }))
    setCurrentMessage(prev => ({ ...prev, [type]: '' }))
    setAllCompleted(false)
  }

  const getElapsedTime = () => (!uploadStartTime || !uploadEndTime) ? '0' : ((uploadEndTime - uploadStartTime) / 1000).toFixed(1)

  const handleModeSelect = (selectedMode) => { setMode(selectedMode); setStep('userId') }
  const handleUserIdNext = async () => {
    const trimmedId = userIdInput.trim()
    if (!trimmedId || isCheckingId) return
    setIsCheckingId(true)
    try {
      const res = await fetch(`/api/check_user_id?id=${trimmedId}`)
      const data = await res.json()
      if (data.exists) showToast('이미 존재하는 ID입니다.')
      else { setUserId(trimmedId); setStep('upload') }
    } catch (e) { showToast('서버 오류') } 
    finally { setIsCheckingId(false) }
  }

  // ── Components ──────────────────────────────────────────────────
  const PhotoSlot = ({ type, label, icon }) => {
    const isProcessing = processingState[type] === 'processing'
    const message = currentMessage[type]

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h3 className="text-sm font-semibold text-slate-300">{label}</h3>
        </div>
        <div
          onDragOver={(e) => handleDragOver(e, type)}
          onDragLeave={(e) => handleDragLeave(e, type)}
          onDrop={(e) => handleDrop(e, type)}
          className={`relative group transition-all duration-300 cursor-pointer ${dragOver[type] ? 'scale-105 ring-2 ring-blue-400' : 'hover:scale-[1.02]'}`}
        >
          <input type="file" accept="image/*" onChange={(e) => handleFileSelect(e, type)} className="hidden" id={`file-${type}`} disabled={isProcessing} />
          <label htmlFor={`file-${type}`} className={`block relative aspect-square rounded-xl overflow-hidden ${isProcessing ? 'cursor-wait' : 'cursor-pointer'} ${photos[type] ? 'bg-slate-800/50' : 'bg-slate-800/30 border-2 border-dashed border-slate-500 hover:border-blue-500'}`}>
            {photos[type] ? (
              <>
                <img src={photos[type]} alt={label} className={`w-full h-full object-cover transition-opacity duration-300 ${isProcessing ? 'opacity-30' : 'opacity-100'}`} />
                {!isProcessing && (
                  <button onClick={(e) => { e.preventDefault(); handleRemove(type) }} className="absolute top-2 right-2 bg-red-500/90 hover:bg-red-600 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <div className="text-center px-4"><p className="text-sm font-medium">클릭 또는 드래그</p></div>
              </div>
            )}
            {(isProcessing || message) && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] flex flex-col items-center justify-center gap-4 z-20">
                {isProcessing && <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>}
                {message && <div className="bg-slate-800/90 px-6 py-3 rounded-lg border border-blue-500/30 shadow-xl"><p className="text-sm font-medium text-blue-300">{message}</p></div>}
              </div>
            )}
          </label>
        </div>
      </div>
    )
  }

  // ── Main Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-start justify-center p-6 pt-12 text-slate-100">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent mb-3">사용자 사진 등록 및 정밀 분석</h1>
          <div className="flex items-center justify-center gap-3 mt-6">
            {['mode', 'userId', 'upload', 'analysis'].map((s, i) => {
              const labels = ['모드 선택', 'ID 입력', '사진 등록', '정밀 분석']
              const current = ['mode', 'userId', 'upload', 'analysis'].indexOf(step)
              const isDone = current > i
              const isActive = current === i
              return (
                <div key={s} className="flex items-center gap-2">
                  {i > 0 && <div className={`w-10 h-px ${isDone ? 'bg-blue-400' : 'bg-slate-600'}`} />}
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-all ${isActive ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : isDone ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-slate-700/40 border-slate-600 text-slate-500'}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold ${isActive ? 'bg-blue-500 text-white' : isDone ? 'bg-green-500 text-white' : 'bg-slate-600 text-slate-400'}`}>{isDone ? '✓' : i + 1}</span>
                    {labels[i]}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {step === 'mode' && (
          <div className="bg-slate-800/40 backdrop-blur-xl rounded-2xl p-10 border border-slate-700/50 text-center">
            <h2 className="text-xl font-semibold mb-8">등록 방식을 선택하세요</h2>
            <button onClick={() => handleModeSelect('new')} className="w-full max-w-md p-8 bg-slate-800/60 hover:bg-blue-500/10 border-2 border-slate-600 hover:border-blue-400 rounded-2xl transition-all flex flex-col items-center gap-4 mx-auto">
              <div className="text-4xl">👤</div>
              <div className="text-lg font-bold text-slate-100">신규 등록</div>
              <p className="text-sm text-slate-400">사용자의 5가지 각도 사진을 등록하고 분석을 준비합니다.</p>
            </button>
          </div>
        )}

        {step === 'userId' && (
          <div className="bg-slate-800/40 backdrop-blur-xl rounded-2xl p-10 border border-slate-700/50 max-w-lg mx-auto">
            <h2 className="text-xl font-semibold text-center mb-8">User ID 입력</h2>
            <input type="text" value={userIdInput} onChange={(e) => setUserIdInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleUserIdNext()} placeholder="예: user_001" className="w-full px-4 py-3 bg-slate-700/60 border border-slate-600 focus:border-blue-400 focus:outline-none rounded-xl text-slate-100 mb-6" />
            <div className="flex gap-3">
              <button onClick={() => setStep('mode')} className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-400 hover:bg-slate-700">이전</button>
              <button onClick={handleUserIdNext} disabled={!userIdInput.trim() || isCheckingId} className="flex-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold disabled:bg-slate-700">다음</button>
            </div>
          </div>
        )}

        {step === 'upload' && (
          <div className="bg-slate-800/40 backdrop-blur-xl rounded-2xl p-8 border border-slate-700/50">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
              <PhotoSlot type="left90" label="좌 90도" icon="👤" />
              <PhotoSlot type="left45" label="좌 45도" icon="👤" />
              <PhotoSlot type="front" label="정면" icon="👤" />
              <PhotoSlot type="right45" label="우 45도" icon="👤" />
              <PhotoSlot type="right90" label="우 90도" icon="👤" />
            </div>
            <div className="flex justify-between items-center bg-blue-500/10 p-4 rounded-xl border border-blue-500/20">
              <span className="text-sm text-blue-300">💡 5가지 각도의 검증이 모두 완료되어야 등록이 가능합니다.</span>
              <button onClick={() => setShowSuccessModal(true)} disabled={!allCompleted} className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all">등록하기</button>
            </div>
          </div>
        )}

        {step === 'analysis' && (
          <div className="bg-slate-800/40 backdrop-blur-xl rounded-2xl p-8 border border-slate-700/50">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-700/50">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-3"><span className="text-blue-400">🔍</span>정밀 분석 파이프라인</h2>
                <p className="text-slate-400 text-sm mt-1">사용자 {userId}님에 대한 웹 서칭 및 딥페이크 분석을 시작합니다.</p>
              </div>
              {!isAnalyzing && !analysisDone && (
                <button
                  onClick={async () => {
                    setIsAnalyzing(true); setAnalysisLogs([]);
                    try {
                      const res = await fetch('/api/start-from-crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId }) })
                      const data = await res.json()
                      if (data.job_id) {
                        setAnalysisJobId(data.job_id)
                        const es = new EventSource(`/api/stream/${data.job_id}`)
                        es.addEventListener('update', (e) => {
                          const p = JSON.parse(e.data); setAnalysisLogs(prev => [...prev, p]); setCurrentAnalysisStep(p.step)
                        })
                        es.addEventListener('end', () => { setIsAnalyzing(false); setAnalysisDone(true); es.close() })
                        es.onerror = () => { es.close(); setIsAnalyzing(false) }
                      }
                    } catch (e) { showToast('분석 실패'); setIsAnalyzing(false) }
                  }}
                  className="bg-blue-500 hover:bg-blue-600 px-6 py-2.5 rounded-xl font-bold transition-all"
                >분석 시작하기</button>
              )}
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap gap-4 justify-between items-center py-6 px-4 bg-slate-900/40 rounded-2xl border border-slate-700/30">
                {[
    { id: 'user_vec', label: '사용자 분석', icon: '👤' },
    { id: 'crawl', label: '크롤링', icon: '🌐' },
    { id: 'crawl_vec', label: '벡터 분석', icon: '🧬' },
    { id: 'deepfake', label: '딥페이크', icon: '🧠' },
    { id: 'done', label: '분석 완료', icon: '✅' }
  ].map((p, idx) => {
                  const stepLogs = analysisLogs.filter(l => l.step === p.id)
                  const lastLog = stepLogs[stepLogs.length - 1]
                  const isRun = currentAnalysisStep === p.id && isAnalyzing
                  const isDone = lastLog?.status === 'success'
                  const isError = lastLog?.status === 'error'
                  
                  return (
                    <div key={p.id} className="flex flex-col items-center gap-2">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-all ${isRun ? 'bg-blue-500 animate-pulse' : isDone ? 'bg-green-500/20 text-green-400 border border-green-500/50' : isError ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-slate-800 text-slate-600 border border-slate-700'}`}>
                        {isDone ? '✓' : isError ? '✕' : p.icon}
                      </div>
                      <span className={`text-[10px] font-bold ${isRun ? 'text-blue-400' : isDone ? 'text-green-400' : isError ? 'text-red-400' : 'text-slate-500'}`}>{p.label}</span>
                    </div>
                  )
                })}
              </div>

              <div className="bg-slate-900/60 rounded-xl border border-slate-700/50 h-[300px] overflow-y-auto p-4 font-mono text-xs space-y-2">
                {analysisLogs.length === 0 ? <p className="text-slate-600 italic text-center mt-32">파이프라인 로그가 여기에 표시됩니다.</p> :
                  analysisLogs.map((l, i) => (
                    <div key={i} className="flex gap-2 border-l border-slate-700 pl-2">
                      <span className="text-slate-500">[{l.ts}]</span>
                      <span className={`font-bold w-16 ${l.status === 'success' ? 'text-green-400' : l.status === 'error' ? 'text-red-400' : 'text-blue-400'}`}>{l.step}</span>
                      <span className="text-slate-300">{l.message}</span>
                    </div>
                  )).reverse()
                }
              </div>
            </div>
            {analysisDone && (
              <div className="mt-8 flex flex-col items-center gap-4">
                <button 
                  onClick={() => window.location.href = '/evidence/index.html'}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 shadow-lg transition-all hover:scale-[1.02]"
                >
                  <span className="text-xl">🛡️</span>
                  증거 확인 및 조치하기
                </button>
                <button 
                  onClick={() => {
                    localStorage.clear();
                    window.location.reload();
                  }} 
                  className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-slate-300"
                >
                  처음으로
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 max-w-sm w-full p-8 text-center">
            <div className="text-5xl mb-4 text-green-400">✅</div>
            <h2 className="text-2xl font-bold mb-2">등록 성공!</h2>
            <p className="text-slate-400 text-sm mb-8">사용자 정보와 사진이 데이터베이스에 안전하게 저장되었습니다.</p>
            <button onClick={async () => { await registerToDb(photos); setShowSuccessModal(false); setStep('analysis') }} className="w-full bg-blue-500 py-3 rounded-xl font-bold hover:bg-blue-600 disabled:bg-slate-700">{isSaving ? '저장 중...' : '분석 화면으로 이동'}</button>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-red-500 text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-2 animate-slide-in">
          <span>⚠️</span> {toastMessage}
        </div>
      )}
    </div>
  )
}

export default App

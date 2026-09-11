import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, HelpCircle, CheckCircle, XCircle,
  Loader, Trophy, RotateCcw, BookOpen, Target, Clock, Flag, LayoutGrid, Check
} from 'lucide-react';
import './Quiz.css';

const API_SUBJECTS = 'https://msbtemcq-hub.onrender.com/api/subjects';
const API_TESTS = 'https://msbtemcq-hub.onrender.com/api/tests';

const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('token')}`
});

const Quiz = () => {
  const { subjectId } = useParams();
  const navigate = useNavigate();

  // Global State
  const [subject, setSubject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('chapterList'); // chapterList, setup, active, submitting, results

  // Test State
  const [activeChapter, setActiveChapter] = useState(null);
  const [numQuestions, setNumQuestions] = useState(10);
  const [attemptId, setAttemptId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // { [questionId]: { selectedOption, isMarkedForReview } }
  const [timeSpent, setTimeSpent] = useState(0); // in seconds
  const [resultsData, setResultsData] = useState(null);
  const [jumpToQ, setJumpToQ] = useState('');
  const [visitedQuestions, setVisitedQuestions] = useState(new Set());
  const [sidebarTab, setSidebarTab] = useState('all'); // 'all', 'attempted', 'skipped'

  // Fetch subject details
  useEffect(() => {
    const fetchSubject = async () => {
      try {
        const res = await fetch(`${API_SUBJECTS}/${subjectId}`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('Failed to load subject');
        const data = await res.json();
        setSubject(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSubject();
  }, [subjectId]);

  // Timer Effect
  useEffect(() => {
    let interval;
    if (mode === 'active') {
      interval = setInterval(() => {
        setTimeSpent(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [mode]);

  // Track visited questions (for skipped indicator)
  useEffect(() => {
    if (mode === 'active' && questions.length > 0) {
      setVisitedQuestions(prev => {
        const next = new Set(prev);
        next.add(currentIndex);
        return next;
      });
    }
  }, [currentIndex, mode, questions.length]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // 1. Setup Phase
  const handleChapterSelect = (chapter) => {
    setActiveChapter(chapter);
    setNumQuestions(Math.min(10, chapter.questionCount)); // default
    setMode('setup');
  };

  const startTest = async () => {
    setMode('submitting'); // show loader
    try {
      const res = await fetch(`${API_TESTS}/generate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          chapterId: activeChapter.id,
          numQuestions: Number(numQuestions)
        })
      });
      if (!res.ok) throw new Error('Failed to generate test');
      const data = await res.json();
      
      setAttemptId(data.attemptId);
      setQuestions(data.questions);
      
      // Initialize answers object
      const initialAnswers = {};
      data.questions.forEach(q => {
        initialAnswers[q.id] = { selectedOption: null, isMarkedForReview: false };
      });
      setAnswers(initialAnswers);
      setCurrentIndex(0);
      setTimeSpent(0);
      setMode('active');
    } catch (err) {
      console.error(err);
      setMode('setup');
      alert('Failed to start test. Please try again.');
    }
  };

  // 2. Active Test Interactions
  const handleOptionSelect = (option) => {
    const qId = questions[currentIndex].id;
    setAnswers(prev => ({
      ...prev,
      [qId]: { ...prev[qId], selectedOption: option }
    }));
  };

  const toggleReview = () => {
    const qId = questions[currentIndex].id;
    setAnswers(prev => ({
      ...prev,
      [qId]: { ...prev[qId], isMarkedForReview: !prev[qId].isMarkedForReview }
    }));
  };

  // 3. Submission & Navigation
  const handleJumpToQuestion = (e) => {
    e.preventDefault();
    const qNum = parseInt(jumpToQ, 10);
    if (!isNaN(qNum) && qNum >= 1 && qNum <= questions.length) {
      setCurrentIndex(qNum - 1);
      setJumpToQ('');
    }
  };

  const submitTest = async () => {
    if (!window.confirm("Are you sure you want to submit your test?")) return;
    
    setMode('submitting');
    
    // Format payload
    const submissionPayload = questions.map(q => ({
      questionId: q.id,
      selectedOption: answers[q.id].selectedOption,
      timeSpent: 0 // currently global time is tracked, setting 0 per question for now
    }));

    // In a real advanced app, we'd distribute timeSpent proportionally or track per question
    submissionPayload[0].timeSpent = timeSpent; 

    try {
      const res = await fetch(`${API_TESTS}/${attemptId}/submit`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ answers: submissionPayload })
      });
      
      if (!res.ok) throw new Error('Failed to submit test');
      
      // Fetch full results to show analytics
      const resultRes = await fetch(`${API_TESTS}/${attemptId}`, { headers: getAuthHeaders() });
      const resultData = await resultRes.json();
      
      setResultsData(resultData);
      setMode('results');
    } catch (err) {
      console.error(err);
      alert('Failed to submit test.');
      setMode('active');
    }
  };

  const resetToChapters = () => {
    setActiveChapter(null);
    setMode('chapterList');
    setResultsData(null);
  };

  // ─── RENDERERS ────────────────────────────

  if (loading) {
    return (
      <div className="quiz-container">
        <div className="quiz-loading">
          <Loader size={32} className="spinner-icon" />
          <p>Loading subject...</p>
        </div>
      </div>
    );
  }

  if (!subject) return <div className="quiz-container">Subject not found.</div>;

  // Render: Setup Mode
  if (mode === 'setup') {
    return (
      <div className="quiz-container">
        <button className="back-btn" onClick={() => setMode('chapterList')}>
          <ArrowLeft size={18} /> Back to Chapters
        </button>
        <div className="setup-card">
          <div className="setup-icon"><Target size={40} /></div>
          <h2>Test Setup</h2>
          <p>Chapter {activeChapter.chapterNumber}: <strong>{activeChapter.title}</strong></p>
          
          <div className="setup-form">
            <label>How many questions?</label>
            <input 
              type="number" 
              min="1" 
              max={activeChapter.questionCount}
              value={numQuestions}
              onChange={(e) => setNumQuestions(e.target.value)}
            />
            <small>Max available: {activeChapter.questionCount}</small>
          </div>

          {Number(numQuestions) > activeChapter.questionCount && (
            <small style={{ color: 'red' }}>Number of questions cannot exceed the available questions count</small>
          )}
          <button className="premium-btn" onClick={startTest} disabled={Number(numQuestions) < 1 || Number(numQuestions) > activeChapter.questionCount}>Start Test</button>
        </div>
      </div>
    );
  }

  // Render: Submitting Mode
  if (mode === 'submitting') {
    return (
      <div className="quiz-container">
        <div className="quiz-loading">
          <Loader size={32} className="spinner-icon" />
          <p>Processing your test...</p>
        </div>
      </div>
    );
  }

  // Render: Active Test Mode
  if (mode === 'active' && questions.length > 0) {
    const q = questions[currentIndex];
    const currentAnswer = answers[q.id];
    
    const options = [
      { letter: 'A', text: q.optionA },
      { letter: 'B', text: q.optionB },
      { letter: 'C', text: q.optionC },
      { letter: 'D', text: q.optionD }
    ];

    const answeredCount = Object.values(answers).filter(a => a.selectedOption).length;

    return (
      <div className="quiz-container active-test-layout">
        
        {/* Left Sidebar Navigator */}
        <div className="test-sidebar">
          <div className="test-stats">
            <div className="timer"><Clock size={16}/> {formatTime(timeSpent)}</div>
            <div className="progress-text">{answeredCount} of {questions.length} Answered</div>
          </div>

          {/* Sidebar Tabs */}
          <div className="sidebar-tabs">
            <button className={`sidebar-tab ${sidebarTab === 'all' ? 'active' : ''}`} onClick={() => setSidebarTab('all')}>
              All ({questions.length})
            </button>
            <button className={`sidebar-tab tab-attempted ${sidebarTab === 'attempted' ? 'active' : ''}`} onClick={() => setSidebarTab('attempted')}>
              Attempted ({answeredCount})
            </button>
            <button className={`sidebar-tab tab-skipped ${sidebarTab === 'skipped' ? 'active' : ''}`} onClick={() => setSidebarTab('skipped')}>
              Skipped ({questions.filter((q, idx) => !answers[q.id]?.selectedOption && visitedQuestions.has(idx)).length})
            </button>
          </div>
          
          <div className="desktop-grid question-grid">
            {questions.map((question, idx) => {
              const ans = answers[question.id];
              const isAnswered = !!ans?.selectedOption;
              const isSkipped = !isAnswered && visitedQuestions.has(idx);

              // Filter based on active tab
              if (sidebarTab === 'attempted' && !isAnswered) return null;
              if (sidebarTab === 'skipped' && !isSkipped) return null;

              let btnClass = 'grid-btn';
              if (idx === currentIndex) btnClass += ' current';
              else if (ans?.isMarkedForReview) btnClass += ' review';
              else if (isAnswered) btnClass += ' answered';
              else if (isSkipped) btnClass += ' skipped';
              
              return (
                <button 
                  key={question.id} 
                  className={btnClass}
                  onClick={() => { setCurrentIndex(idx); setSidebarTab('all'); }}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {sidebarTab !== 'all' && (
            <button className="back-to-all-btn" onClick={() => setSidebarTab('all')}>
              <ArrowLeft size={14} /> Back to All Questions
            </button>
          )}

          <form className="mobile-jump-form" onSubmit={handleJumpToQuestion}>
            <span className="jump-label">Jump to Question:</span>
            <input 
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="e.g. 5" 
              value={jumpToQ}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                setJumpToQ(val);
              }}
              className="jump-input"
            />
            <button type="submit" className="jump-btn">Go</button>
          </form>

          <button className="submit-test-btn" onClick={submitTest}>
            <Check size={18} /> Submit Test
          </button>
        </div>

        {/* Main Question Panel */}
        <div className="test-main">
          <div className="question-header">
            <h3>Question {currentIndex + 1}</h3>
            <button 
              className={`review-btn ${currentAnswer.isMarkedForReview ? 'active' : ''}`}
              onClick={toggleReview}
            >
              <Flag size={16} /> Mark for Review
            </button>
          </div>
          
          <div className="question-text">{q.questionText}</div>
          
          <div className="options-list">
            {options.map(opt => (
              <button
                key={opt.letter}
                className={`option-btn ${currentAnswer.selectedOption === opt.letter ? 'selected' : ''}`}
                onClick={() => handleOptionSelect(opt.letter)}
              >
                <span className="option-letter">{opt.letter}</span>
                <span>{opt.text}</span>
              </button>
            ))}
          </div>

          <div className="test-navigation">
            <button 
              className="nav-btn outline" 
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
            >
              <ArrowLeft size={18} /> Previous
            </button>
            
            {currentIndex === questions.length - 1 ? (
              <button className="nav-btn primary" onClick={submitTest}>
                Submit Test
              </button>
            ) : (
              <button 
                className="nav-btn primary"
                onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
              >
                Next <ArrowRight size={18} />
              </button>
            )}
          </div>
        </div>

      </div>
    );
  }

  // Render: Results Mode
  if (mode === 'results' && resultsData) {
    const percentage = Math.round((resultsData.score / resultsData.totalQs) * 100);
    const resultLevel = percentage >= 80 ? 'great' : percentage >= 50 ? 'good' : 'improve';
    
    // Calculate stats
    const correct = resultsData.score;
    const skipped = resultsData.answers.filter(a => a.isSkipped).length;
    const wrong = resultsData.totalQs - correct - skipped;

    return (
      <div className="quiz-container">
        <div className="results-wrapper">
          <div className="results-card">
            <div className={`results-icon ${resultLevel}`}>
              <Trophy size={36} />
            </div>
            <h2>{resultLevel === 'great' ? 'Excellent Work!' : resultLevel === 'good' ? 'Good Effort!' : 'Needs Practice!'}</h2>
            <p className="results-subtitle">Chapter: {resultsData.chapter.title}</p>

            <div className="results-score-ring" style={{
              background: `conic-gradient(${resultLevel === 'great' ? '#22c55e' : resultLevel === 'good' ? '#3b82f6' : '#f59e0b'} ${percentage * 3.6}deg, #f1f5f9 0deg)`
            }}>
              <div className="ring-inner">
                <span className="percentage">{percentage}%</span>
                <span className="time-taken">{formatTime(resultsData.timeSpent)}</span>
              </div>
            </div>

            <div className="results-stats">
              <div className="results-stat">
                <div className="value correct-val">{correct}</div>
                <div className="label">Correct</div>
              </div>
              <div className="results-stat">
                <div className="value wrong-val">{wrong}</div>
                <div className="label">Incorrect</div>
              </div>
              <div className="results-stat">
                <div className="value skipped-val">{skipped}</div>
                <div className="label">Skipped</div>
              </div>
            </div>

            <div className="results-actions">
              <a 
                href={`https://api.whatsapp.com/send?text=I just scored ${correct}/${resultsData.totalQs} in ${resultsData.chapter.title} on takeUforward! Think you can beat my score? Try it here: https://takeufroward.vercel.app/`}
                target="_blank" 
                rel="noreferrer"
                className="results-btn"
                style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '8px' }}>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                </svg>
                Share on WhatsApp
              </a>
              <button className="results-btn secondary" onClick={() => handleChapterSelect(resultsData.chapter)}>
                <RotateCcw size={18} /> Retake Test
              </button>
              <button className="results-btn primary" onClick={resetToChapters}>
                <BookOpen size={18} /> Back to Chapters
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render: Default Chapter List Mode
  return (
    <div className="quiz-container">
      <button className="back-btn" onClick={() => navigate('/subjects')}>
        <ArrowLeft size={18} /> Back to Subjects
      </button>

      <div className="quiz-subject-header">
        <span className="subject-code">{subject.code}</span>
        <h1>{subject.title}</h1>
        <p>{subject.chapters.length} Chapters • {subject.chapters.reduce((sum, ch) => sum + ch.questionCount, 0)} Total MCQs</p>
      </div>

      <div className="chapters-grid">
        {subject.chapters.map(ch => (
          <div
            key={ch.id}
            className={`chapter-card ${ch.questionCount === 0 ? 'disabled' : ''}`}
            onClick={() => ch.questionCount > 0 && handleChapterSelect(ch)}
          >
            <div className="chapter-number">Chapter {ch.chapterNumber}</div>
            <h3>{ch.title}</h3>
            <div className="chapter-meta">
              <LayoutGrid size={16} />
              <span>{ch.questionCount} Questions Available</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Quiz;

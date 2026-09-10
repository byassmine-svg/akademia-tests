// formai-bridge.js — Bridge between course HTML pages and FormAI player
(function() {
  'use strict';

  var _moduleId = null;
  var _userId = null;
  var _email = null;
  var _name = null;
  var _scrollExperienced = false;
  var _maxScrollDepth = 0;
  var _isInIframe = (window.self !== window.top);

  // ─── 0. Iframe mode: hide redundant controls ────────────────────
  if (_isInIframe) {
    function setupIframeMode() {
      // Hide fullscreen button (parent CourseIframe has its own)
      var fsBtn = document.querySelector('.fullscreen-btn');
      if (fsBtn) fsBtn.style.display = 'none';

      // Hide theme toggle (parent controls theme via postMessage)
      var themeToggle = document.getElementById('theme-toggle');
      if (themeToggle) themeToggle.style.display = 'none';

      // Skip splash screen but auto-play intro video
      var splash = document.getElementById('splash-screen');
      if (splash) {
        splash.remove();
        // Auto-play intro video instead of skipping it
        var introSection = document.getElementById('intro-section');
        var videoIntro = document.getElementById('video-intro');
        if (introSection && videoIntro) {
          introSection.classList.remove('hidden');
          videoIntro.muted = false;
          videoIntro.currentTime = 0;
          videoIntro.play().catch(function() {
            // Autoplay blocked — try muted then unmute on interaction
            videoIntro.muted = true;
            videoIntro.play().catch(function() {});
          });
        }
      }

      // Add stop button next to Jade orb (idempotent : setupIframeMode peut être
      // appelé plus d'une fois — ne pas créer de bouton/setter en double).
      var orbContainer = document.querySelector('.jade-orb-container');
      if (orbContainer && !document.getElementById('jade-stop-btn')) {
        var stopBtn = document.createElement('button');
        stopBtn.id = 'jade-stop-btn';
        stopBtn.innerHTML = '&#10074;&#10074;'; // ❚❚ icône pause
        stopBtn.title = 'Mettre Jade en pause';
        stopBtn.setAttribute('style',
          'position:fixed;bottom:24px;right:100px;width:40px;height:40px;border-radius:50%;' +
          'background:#ef4444;color:white;border:2px solid #dc2626;font-size:16px;line-height:1;' +
          'cursor:pointer;z-index:999;display:none;align-items:center;justify-content:center;' +
          'box-shadow:0 4px 12px rgba(239,68,68,0.4);transition:transform 0.2s,opacity 0.2s;padding:0');
        stopBtn.onmouseenter = function() { this.style.transform = 'scale(1.1)'; };
        stopBtn.onmouseleave = function() { this.style.transform = 'scale(1)'; };
        stopBtn.onclick = function(e) {
          e.stopPropagation();
          // Bouton PAUSE / REPRISE. Sur les modules qui exposent window.toggleJadePause,
          // on met Jade en pause (micro coupé + son coupé) SANS fermer la connexion :
          // aucune erreur ni reconnexion possible. Repli propre (arrêt) sur les pages
          // qui n'ont pas encore la pause.
          if (typeof window.toggleJadePause === 'function') {
            var paused = null;
            try { paused = window.toggleJadePause(); } catch(ex) {}
            if (paused === null) return; // pas de session active
            if (paused) {
              stopBtn.innerHTML = '&#9654;'; // ▶ reprendre
              stopBtn.title = 'Reprendre Jade';
              stopBtn.style.background = '#22c55e';
              stopBtn.style.borderColor = '#16a34a';
            } else {
              stopBtn.innerHTML = '&#10074;&#10074;'; // ❚❚ pause
              stopBtn.title = 'Mettre Jade en pause';
              stopBtn.style.background = '#ef4444';
              stopBtn.style.borderColor = '#dc2626';
            }
            if (typeof xapiTracker !== 'undefined' && xapiTracker.trackInteraction) {
              xapiTracker.trackInteraction(window._moduleId || 'jade-session', 'Jade Session', paused ? 'agent_paused' : 'agent_resumed');
            }
            return;
          }
          // Repli (pages sans pause) : arrêt propre via toggleAgent, sinon endSession direct.
          if (typeof window.toggleAgent === 'function' && window.agentConnected) {
            try { window.toggleAgent(); } catch(ex) {}
          } else {
            if (window.elevenLabsConversation) {
              try { window.elevenLabsConversation.endSession(); } catch(ex) {}
              window.elevenLabsConversation = null;
            }
            window.agentConnected = false;
            if (window.jadeOrb) try { window.jadeOrb.setState('idle'); } catch(ex) {}
          }
          if (typeof xapiTracker !== 'undefined' && xapiTracker.trackInteraction) {
            xapiTracker.trackInteraction(window._moduleId || 'jade-session', 'Jade Session', 'agent_stopped_by_user');
          }
          stopBtn.style.display = 'none';
        };
        document.body.appendChild(stopBtn);

        // Show stop button when Jade connects
        var _origAgentConnected = Object.getOwnPropertyDescriptor(window, 'agentConnected');
        var _agentConnectedValue = window.agentConnected;
        try {
          Object.defineProperty(window, 'agentConnected', {
            get: function() { return _agentConnectedValue; },
            set: function(v) {
              _agentConnectedValue = v;
              stopBtn.style.display = v ? 'flex' : 'none';
              if (v) { // nouvelle session : réinitialiser le bouton en état « pause »
                stopBtn.innerHTML = '&#10074;&#10074;';
                stopBtn.title = 'Mettre Jade en pause';
                stopBtn.style.background = '#ef4444';
                stopBtn.style.borderColor = '#dc2626';
              }
            },
            configurable: true
          });
        } catch(ex) {
          // Fallback: poll for connection state
          setInterval(function() {
            var connected = !!(window.elevenLabsConversation && window.elevenLabsConversation.status === 'connected');
            stopBtn.style.display = connected ? 'flex' : 'none';
          }, 2000);
        }
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupIframeMode);
    } else {
      // DOM ready but scripts may not have defined skipIntroVideo yet
      setTimeout(setupIframeMode, 50);
    }
  }

  // ─── 1. Listen for init and theme from parent ────────────────────
  var ALLOWED_PARENT_ORIGINS = [
    'https://www.akademiaformation.com',
    'https://akademiaformation.com',
    'https://cours.akademiaformation.com',
    'https://lms.akademiaformation.com'
  ];

  window.addEventListener('message', function(e) {
    if (!e.data) return;
    // Reject messages from any origin not in the allowlist.
    // Without this check any embedding page could spoof the learner identity.
    if (ALLOWED_PARENT_ORIGINS.indexOf(e.origin) === -1) return;

    // Handle init message
    if (e.data.type === 'formai:init') {
      _moduleId = e.data.moduleId;
      _userId = e.data.userId;
      _email = e.data.email;
      _name = e.data.name;
      // Pass credentials to xapi-tracker if available
      if (typeof xapiTracker !== 'undefined' && xapiTracker.setUser) {
        xapiTracker.setUser(_email, _name);
      }
    }

    // Handle scroll restore
    if (e.data.type === 'formai:restore-scroll' && e.data.percent > 0) {
      var pct = e.data.percent / 100;
      var docHeight = Math.max(
        document.body.scrollHeight || 0,
        document.documentElement.scrollHeight || 0
      );
      var winHeight = window.innerHeight || document.documentElement.clientHeight;
      var targetY = Math.round(pct * (docHeight - winHeight));
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    }

    // Handle theme sync (from init or dedicated theme message)
    if (e.data.type === 'formai:init' || e.data.type === 'formai:theme') {
      var theme = e.data.theme;
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('ia101_theme', theme);
      // Hide the internal theme toggle when embedded in iframe
      var themeToggle = document.getElementById('theme-toggle') || document.querySelector('[data-theme-toggle]');
      if (themeToggle) themeToggle.style.display = 'none';
    }
  });

  // ─── 2. Scroll depth tracking ────────────────────────────────────
  function getScrollPercent() {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight = Math.max(
      document.body.scrollHeight || 0,
      document.documentElement.scrollHeight || 0
    );
    var winHeight = window.innerHeight || document.documentElement.clientHeight;
    if (docHeight <= winHeight) return 100;
    return Math.min(100, Math.round((scrollTop / (docHeight - winHeight)) * 100));
  }

  var _scrollThrottle = null;
  window.addEventListener('scroll', function() {
    if (_scrollThrottle) return;
    _scrollThrottle = setTimeout(function() {
      _scrollThrottle = null;
      var depth = getScrollPercent();
      if (depth > _maxScrollDepth) {
        _maxScrollDepth = depth;
      }
      // At 80%+ scroll, mark as experienced (only once) — completion requires quiz
      if (_maxScrollDepth >= 80 && !_scrollExperienced) {
        _scrollExperienced = true;
        notifyParent({
          type: 'formai:progress',
          experienced: true,
          completed: false,
          timeSpent: 0,
          source: 'scroll',
          scrollDepth: _maxScrollDepth
        });
        // xAPI scroll depth
        if (typeof xapiTracker !== 'undefined' && xapiTracker.trackScrollDepth) {
          xapiTracker.trackScrollDepth(
            _moduleId || 'unknown',
            document.title,
            _maxScrollDepth
          );
        }
        // xAPI experienced (NOT completed — completion only via quiz)
        if (typeof xapiTracker !== 'undefined' && xapiTracker.trackExperienced) {
          xapiTracker.trackExperienced(
            _moduleId || 'unknown',
            document.title,
            _maxScrollDepth
          );
        }
      }
    }, 200); // throttle to 200ms
  });

  // ─── 2b. Report scroll position to parent every 5s ──────────────
  if (_isInIframe) {
    setInterval(function() {
      var pct = getScrollPercent();
      if (pct > 0) {
        notifyParent({ type: 'formai:scroll-position', percent: pct });
      }
    }, 5000);
  }

  // ─── 3. Exercise completion detection ───────────────────────────
  // Detect when all exercises on a page are completed via localStorage polling.
  // Each exercise page stores results in localStorage with known keys:
  //   M1: ia101_exercises (array, 3 exercises)
  //   M2: ia101_exercises_m2 (object with ex1-ex6 keys)
  //   M3: ia101_exercises_m3 (object with ex-drag, ex-fill, ex-quiz3, ex-vf, ex-mat, ex-branch)
  //   M4: ia101_exercises_m4 (object with ex-drag, ex-roi, ex-sit, ex-vf, ex-essay, ex-branch)

  var _moduleCompleted = false;

  // Explicit API: pages can call this directly
  window.formaiModuleComplete = function(totalScore, maxScore) {
    if (_moduleCompleted) return;
    _moduleCompleted = true;
    var passed = maxScore > 0 && (totalScore / maxScore) >= 0.5;
    notifyParent({
      type: 'formai:quiz-result',
      exerciseId: _moduleId || 'exercises',
      score: totalScore,
      maxScore: maxScore,
      passed: passed
    });
    notifyParent({
      type: 'formai:progress',
      completed: true,
      timeSpent: 0,
      source: 'quiz',
      quizScore: totalScore,
      quizMaxScore: maxScore
    });
    // xAPI
    if (typeof xapiTracker !== 'undefined') {
      if (xapiTracker.trackQuizScore) {
        xapiTracker.trackQuizScore(_moduleId || 'exercises', document.title, totalScore, maxScore);
      }
      if (xapiTracker.trackCompleted) {
        xapiTracker.trackCompleted(_moduleId || 'exercises', document.title, 0);
      }
    }
  };

  // Explicit API: full quiz detail (per-question answers, per-theme scores,
  // optional self-assessment). Feeds the parent app (formai:quiz-detail →
  // quizAttempts) and the LRS (one enriched 'scored' statement).
  // detail = { exerciseId, quizType: 'positioning'|'evaluation'|'satisfaction',
  //            score, max, passed, durationSeconds,
  //            answers: [{questionId, theme, question, answer, answerLabel,
  //                       correctAnswer, correctLabel, correct}],
  //            themes: {label: {correct, total}}, selfAssessment }
  window.formaiQuizDetail = function(detail) {
    detail = detail || {};
    var exerciseId = detail.exerciseId || _moduleId || 'quiz';
    notifyParent({
      type: 'formai:quiz-detail',
      exerciseId: exerciseId,
      quizType: detail.quizType || 'evaluation',
      score: detail.score,
      maxScore: detail.max,
      passed: detail.passed,
      answers: Array.isArray(detail.answers) ? detail.answers : [],
      themes: detail.themes || {},
      selfAssessment: detail.selfAssessment || null,
      durationSeconds: detail.durationSeconds
    });
    if (typeof xapiTracker !== 'undefined' && xapiTracker.trackQuizDetail) {
      xapiTracker.trackQuizDetail(exerciseId, document.title, detail);
    }
  };

  // Auto-detect exercise completion by polling localStorage
  // Each module stores exercises in its own localStorage key
  var EXERCISE_CONFIGS = {
    'ia101_exercises_m2': { module: 'm2', count: 6, keys: ['ex1','ex2','ex3','ex4','ex5','ex6'], maxScore: 44 },
    'ia101_exercises_m3': { module: 'm3', count: 6, keys: ['ex-drag','ex-fill','ex-quiz3','ex-vf','ex-mat','ex-branch'], maxScore: 200 },
    'ia101_exercises_m4': { module: 'm4', count: 6, keys: ['ex-drag','ex-roi','ex-sit','ex-vf','ex-essay','ex-branch'], maxScore: 190 }
  };

  // M1 section exercises stored in ia101_exercises array with these IDs
  var M1_EXERCISE_IDS = ['s1-checklist-ia-quotidien', 's2-timeline-ordering', 's3-matching-familles', 's4-vrai-faux-mythes', 's5-quiz-final-m1'];

  function checkExerciseCompletion() {
    if (_moduleCompleted) return;

    // Only check exercises relevant to the current module
    var currentModule = _moduleId || '';

    // Check M2/M3/M4 localStorage patterns
    for (var storageKey in EXERCISE_CONFIGS) {
      var config = EXERCISE_CONFIGS[storageKey];
      // Only check if we're on the matching module (or on its exercise/eval page)
      if (currentModule && currentModule !== config.module &&
          currentModule.indexOf(config.module) !== 0) continue;
      try {
        var raw = localStorage.getItem(storageKey);
        if (!raw) continue;
        var data = JSON.parse(raw);
        if (!data || typeof data !== 'object') continue;

        var completed = 0;
        var totalScore = 0;
        for (var i = 0; i < config.keys.length; i++) {
          var key = config.keys[i];
          if (data[key] !== undefined && data[key] !== null) {
            completed++;
            if (typeof data[key] === 'object' && typeof data[key].score === 'number') {
              totalScore += data[key].score;
            } else if (typeof data[key] === 'number') {
              totalScore += data[key];
            }
          }
        }
        if (completed >= config.count) {
          window.formaiModuleComplete(totalScore, config.maxScore);
          return;
        }
      } catch(ex) {}
    }

    // Check M1 pattern: ia101_exercises array filtered by known M1 exercise IDs
    if (!currentModule || currentModule === 'm1' || currentModule.indexOf('m1') === 0) {
      try {
        var m1Raw = localStorage.getItem('ia101_exercises');
        if (m1Raw) {
          var m1Data = JSON.parse(m1Raw);
          if (Array.isArray(m1Data)) {
            var m1Score = 0;
            var m1Max = 0;
            var m1Count = 0;
            for (var j = 0; j < m1Data.length; j++) {
              var exId = m1Data[j].exerciseId || '';
              // Only count M1 section exercises (not M2 exercises stored in same array)
              for (var k = 0; k < M1_EXERCISE_IDS.length; k++) {
                if (exId === M1_EXERCISE_IDS[k]) {
                  m1Count++;
                  if (m1Data[j].score !== undefined) m1Score += m1Data[j].score;
                  if (m1Data[j].maxScore !== undefined) m1Max += m1Data[j].maxScore;
                  break;
                }
              }
            }
            // Need at least 4 of 5 M1 exercises (s1-s4 are in-module, s5 is final quiz)
            if (m1Count >= 4) {
              window.formaiModuleComplete(m1Score, m1Max || 30);
              return;
            }
          }
        }
      } catch(ex) {}
    }

    // Check positionnement completion
    if (currentModule === 'positionnement-pre' || currentModule === 'positionnement-post') {
      try {
        var mode = currentModule === 'positionnement-pre' ? 'pre' : 'post';
        var posKey = 'ia101_positionnement_' + mode;
        var posScore = localStorage.getItem(posKey);
        if (posScore !== null && posScore !== '') {
          var score = parseInt(posScore, 10);
          if (!isNaN(score)) {
            window.formaiModuleComplete(score, 20);
            return;
          }
        }
      } catch(ex) {}
    }
  }

  // Poll every 3 seconds for exercise completion in localStorage
  if (_isInIframe) {
    setInterval(checkExerciseCompletion, 3000);
    // Also check after a delay on page load (restoring saved state)
    setTimeout(checkExerciseCompletion, 2000);
  }

  // Legacy hook: saveExerciseProgress (M1 compat — sends per-exercise results)
  function hookQuizFunctions() {
    if (typeof window.saveExerciseProgress === 'function' && !window._formaiBridgeHooked) {
      var original = window.saveExerciseProgress;
      window.saveExerciseProgress = function(exerciseId, score, maxScore) {
        original.call(this, exerciseId, score, maxScore);
        notifyParent({
          type: 'formai:quiz-result',
          exerciseId: exerciseId,
          score: score,
          maxScore: maxScore,
          passed: maxScore > 0 && (score / maxScore) >= 0.7
        });
        // Don't send completion here — let checkExerciseCompletion handle it
      };
      window._formaiBridgeHooked = true;
    }
  }

  hookQuizFunctions();
  setTimeout(hookQuizFunctions, 500);
  setTimeout(hookQuizFunctions, 1500);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(hookQuizFunctions, 100);
    });
  }

  // ─── 4. Send postMessage to parent ────────────────────────────────
  function notifyParent(data) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(data, '*');
      }
    } catch (e) {
      // Cross-origin restrictions - silent fail
    }
  }

  // ─── 4bis. Excel designer engine: relay exercise completion ────────
  // excel-designer-engine.js dispatches 'excel-designer:exercise-complete'
  // with detail = { exerciseId, score, maxScore }. Engine-based eval pages
  // never call saveExerciseProgress, so relay the score to the parent here.
  document.addEventListener('excel-designer:exercise-complete', function(e) {
    try {
      var d = (e && e.detail) || {};
      if (typeof d.score !== 'number' || typeof d.maxScore !== 'number') return;
      notifyParent({
        type: 'formai:quiz-result',
        exerciseId: d.exerciseId || _moduleId || 'excel-exercise',
        score: d.score,
        maxScore: d.maxScore,
        passed: d.maxScore > 0 && (d.score / d.maxScore) >= 0.5
      });
      notifyParent({
        type: 'formai:progress',
        completed: true,
        timeSpent: 0,
        source: 'quiz',
        quizScore: d.score,
        quizMaxScore: d.maxScore
      });
    } catch (err) { /* ignore */ }
  });

  // ─── 5. Send scroll depth on page unload ──────────────────────────
  window.addEventListener('beforeunload', function() {
    // Always report final scroll depth even if < 80%
    if (_maxScrollDepth > 0) {
      notifyParent({
        type: 'formai:progress',
        experienced: _scrollExperienced,
        completed: false,
        timeSpent: 0,
        source: 'scroll',
        scrollDepth: _maxScrollDepth
      });
    }
  });
})();

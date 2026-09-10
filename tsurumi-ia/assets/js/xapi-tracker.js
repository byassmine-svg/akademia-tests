/**
 * Lightweight xAPI sender for Akademia course pages
 * Supports multiple courses: IA101, EXCEL101, EXCEL201, EXCEL301, etc.
 * Sends statements via h5p-server proxy (no credentials exposed client-side)
 * Zero dependencies, ~4KB
 */
const xapiTracker = (() => {
  const ENDPOINT = '/xapi/statements';

  const VERBS = {
    experienced: {
      id: 'http://adlnet.gov/expapi/verbs/experienced',
      display: { 'fr-FR': 'a consulte', 'en-US': 'experienced' }
    },
    completed: {
      id: 'http://adlnet.gov/expapi/verbs/completed',
      display: { 'fr-FR': 'a termine', 'en-US': 'completed' }
    },
    progressed: {
      id: 'http://adlnet.gov/expapi/verbs/progressed',
      display: { 'fr-FR': 'a progresse', 'en-US': 'progressed' }
    },
    scored: {
      id: 'http://adlnet.gov/expapi/verbs/scored',
      display: { 'fr-FR': 'a obtenu un score', 'en-US': 'scored' }
    },
    interacted: {
      id: 'http://adlnet.gov/expapi/verbs/interacted',
      display: { 'fr-FR': 'a interagi', 'en-US': 'interacted' }
    },
    initialized: {
      id: 'http://adlnet.gov/expapi/verbs/initialized',
      display: { 'fr-FR': 'a initialise', 'en-US': 'initialized' }
    },
    passed: {
      id: 'http://adlnet.gov/expapi/verbs/passed',
      display: { 'fr-FR': 'a reussi', 'en-US': 'passed' }
    },
    failed: {
      id: 'http://adlnet.gov/expapi/verbs/failed',
      display: { 'fr-FR': 'a echoue', 'en-US': 'failed' }
    },
    terminated: {
      id: 'http://adlnet.gov/expapi/verbs/terminated',
      display: { 'fr-FR': 'a termine la session', 'en-US': 'terminated' }
    },
    answered: {
      id: 'http://adlnet.gov/expapi/verbs/answered',
      display: { 'fr-FR': 'a repondu', 'en-US': 'answered' }
    },
    positioned: {
      id: 'http://id.tincanapi.com/verb/positioned',
      display: { 'fr-FR': 's\'est positionne', 'en-US': 'positioned' }
    }
  };

  // Course registry — maps slug to xAPI context
  const COURSES = {
    ia101: {
      id: 'course-v1:AkademiaFR+IA101+2026_T1',
      name: 'IA101 - Introduction a l\'Intelligence Artificielle',
      activityBase: 'https://autoformai.fr/ia101/'
    },
    excel101: {
      id: 'course-v1:AkademiaFR+EXCEL101+2026_T2',
      name: 'EXCEL101 - Excel Debutant',
      activityBase: 'https://cours.akademiaformation.com/excel/'
    },
    excel201: {
      id: 'course-v1:AkademiaFR+EXCEL201+2026_T2',
      name: 'EXCEL201 - Excel Intermediaire',
      activityBase: 'https://cours.akademiaformation.com/excel/'
    },
    excel301: {
      id: 'course-v1:AkademiaFR+EXCEL301+2026_T2',
      name: 'EXCEL301 - Excel Avance',
      activityBase: 'https://cours.akademiaformation.com/excel/'
    },
    'projets-complexes': {
      id: 'course-v1:AkademiaFR+PROJETS_COMPLEXES+2026_T3',
      name: 'Projets Complexes - Piloter des Programmes a Forts Enjeux',
      activityBase: 'https://cours.akademiaformation.com/projets-complexes/'
    },
    'gestion-de-projet': {
      id: 'course-v1:AkademiaFR+GESTION_PROJET+2026_T3',
      name: 'Gestion de Projet - Fondamentaux et Methodologies',
      activityBase: 'https://cours.akademiaformation.com/gestion-de-projet/'
    },
    pentest: {
      id: 'course-v1:AkademiaFR+PENTEST101+2026_T3',
      name: 'Pentest & Tests d\'Intrusion',
      activityBase: 'https://cours.akademiaformation.com/pentest/'
    },
    'konduit-conduite': {
      id: 'course-v1:Konduit+CONDUITE_B+2026',
      name: 'Konduit - Preparation aux lecons de conduite (B)',
      activityBase: 'https://cours.akademiaformation.com/konduit/'
    },
    'droit-social-manager': {
      id: 'course-v1:AkademiaFR+DROIT_SOCIAL_MANAGER+2026_T3',
      name: 'Droit social pour manager',
      activityBase: 'https://cours.akademiaformation.com/droit-social-manager/'
    },
    'fondamentaux-rh': {
      id: 'course-v1:AkademiaFR+FONDAMENTAUX_RH+2026_T3',
      name: 'Fondamentaux RH',
      activityBase: 'https://cours.akademiaformation.com/fondamentaux-rh/'
    },
    'gestion-incidents-cyber': {
      id: 'course-v1:AkademiaFR+GESTION_INCIDENTS_CYBER+2026_T3',
      name: 'Gestion des incidents cyber',
      activityBase: 'https://cours.akademiaformation.com/gestion-incidents-cyber/'
    },
    'prevision-ventes-sop': {
      id: 'course-v1:AkademiaFR+PREVISION_VENTES_SOP+2026_T3',
      name: 'Prevision des ventes & S&OP',
      activityBase: 'https://cours.akademiaformation.com/prevision-ventes-sop/'
    },
    'ia-finance': {
      id: 'course-v1:AkademiaFR+IA_FINANCE+2026_T3',
      name: 'IA pour la Finance - Automatiser l\'analyse financiere et le reporting',
      activityBase: 'https://cours.akademiaformation.com/ia-finance/'
    },
    'pmo-portefeuille': {
      id: 'course-v1:AkademiaFR+PMO_PORTEFEUILLE+2026_T3',
      name: 'PMO et Portefeuille - Piloter un Portefeuille Projets',
      activityBase: 'https://cours.akademiaformation.com/pmo-portefeuille/'
    }
  };

  // Current course — defaults to ia101 for backward compatibility
  let _courseSlug = 'ia101';

  function getCourseContext() {
    const c = COURSES[_courseSlug] || COURSES.ia101;
    return {
      contextActivities: {
        parent: [{
          id: c.id,
          objectType: 'Activity',
          definition: {
            name: { 'fr-FR': c.name },
            type: 'http://adlnet.gov/expapi/activities/course'
          }
        }]
      }
    };
  }

  function getActor() {
    const params = new URLSearchParams(window.location.search);
    const email = params.get('email') || 'anonymous@autoformai.fr';
    const name = params.get('name') || 'Apprenant Anonyme';
    return {
      objectType: 'Agent',
      name: name,
      mbox: 'mailto:' + email
    };
  }

  function getActivity(pageId, pageName) {
    const c = COURSES[_courseSlug] || COURSES.ia101;
    return {
      objectType: 'Activity',
      id: c.activityBase + pageId,
      definition: {
        name: { 'fr-FR': pageName },
        type: 'http://adlnet.gov/expapi/activities/module'
      }
    };
  }

  function toDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    let dur = 'PT';
    if (h > 0) dur += h + 'H';
    if (m > 0) dur += m + 'M';
    dur += s + 'S';
    return dur;
  }

  async function sendStatement(statement) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statement)
      });
      if (res.ok) {
        console.log('[xAPI] Statement sent OK:', statement.verb.display['fr-FR']);
      } else {
        console.warn('[xAPI] Send failed:', res.status);
      }
      return res.ok;
    } catch (e) {
      console.warn('[xAPI] Send error:', e.message);
      return false;
    }
  }

  let _actor = null;

  return {
    /**
     * Set the active course for all subsequent statements.
     * @param {string} slug - Course slug: 'ia101', 'excel101', 'excel201', 'excel301'
     */
    setCourse(slug) {
      _courseSlug = (slug || 'ia101').toLowerCase();
      console.log('[xAPI] Course set to:', _courseSlug);
    },

    setUser(email, name) {
      _actor = { objectType: 'Agent', name: name, mbox: 'mailto:' + email };
    },

    /**
     * Generic send method used by Excel course pages.
     * @param {string} verb - Verb key: 'initialized', 'completed', 'scored', 'passed', 'failed', etc.
     * @param {object} objectData - { id, name, description, score, max, response, success, duration }
     */
    send(verb, objectData) {
      if (!VERBS[verb]) {
        console.warn('[xAPI] Unknown verb:', verb);
        return Promise.resolve(false);
      }
      const activityId = objectData.id || (COURSES[_courseSlug] || COURSES.ia101).activityBase + 'unknown';
      const statement = {
        actor: _actor || getActor(),
        verb: VERBS[verb],
        object: {
          objectType: 'Activity',
          id: activityId,
          definition: {
            name: { 'fr-FR': objectData.name || '' },
            type: objectData.type || 'http://adlnet.gov/expapi/activities/module'
          }
        },
        context: getCourseContext(),
        timestamp: new Date().toISOString()
      };
      if (objectData.description) {
        statement.object.definition.description = { 'fr-FR': objectData.description };
      }
      // Normalisation du score : accepte score+max en nombres (nouveau contrat)
      // OU score sous forme d'objet {raw,max,min,scaled} (ce que passent les 12
      // pages d'éval). Sans cette tolérance, aucun result n'était émis → aucun
      // score n'atteignait le LRS (bug critique de l'audit).
      var _raw, _max;
      if (objectData.score !== null && typeof objectData.score === 'object') {
        _raw = objectData.score.raw;
        _max = (objectData.score.max !== undefined) ? objectData.score.max : objectData.max;
      } else if (objectData.score !== undefined) {
        _raw = objectData.score;
        _max = objectData.max;
      }
      if (typeof _raw === 'number' && typeof _max === 'number' && _max > 0) {
        statement.result = {
          score: { raw: _raw, max: _max, min: 0, scaled: Math.max(0, Math.min(1, _raw / _max)) },
          completion: (objectData.completion !== undefined) ? objectData.completion : true,
          success: objectData.success !== undefined ? objectData.success : (_raw / _max) >= 0.7
        };
      }
      if (objectData.duration !== undefined) {
        statement.result = statement.result || {};
        statement.result.duration = toDuration(objectData.duration);
      }
      if (objectData.response !== undefined) {
        statement.result = statement.result || {};
        statement.result.response = objectData.response;
        if (objectData.success !== undefined) statement.result.success = objectData.success;
      }
      return sendStatement(statement);
    },

    // --- Legacy methods (IA101 pages) — unchanged API ---

    trackPageView(pageId, pageName) {
      return sendStatement({
        actor: _actor || getActor(),
        verb: VERBS.experienced,
        object: getActivity(pageId, pageName),
        context: getCourseContext(),
        timestamp: new Date().toISOString()
      });
    },

    trackTimeSpent(pageId, pageName, durationSeconds) {
      return sendStatement({
        actor: _actor || getActor(),
        verb: VERBS.experienced,
        object: getActivity(pageId, pageName),
        result: {
          duration: toDuration(durationSeconds),
          extensions: {
            'https://autoformai.fr/xapi/extensions/time-spent': durationSeconds
          }
        },
        context: getCourseContext(),
        timestamp: new Date().toISOString()
      });
    },

    trackScrollDepth(pageId, pageName, depthPercent) {
      return sendStatement({
        actor: _actor || getActor(),
        verb: VERBS.progressed,
        object: getActivity(pageId, pageName),
        result: {
          score: { scaled: depthPercent / 100, raw: depthPercent, min: 0, max: 100 },
          extensions: {
            'https://autoformai.fr/xapi/extensions/scroll-depth': depthPercent
          }
        },
        context: getCourseContext(),
        timestamp: new Date().toISOString()
      });
    },

    trackQuizScore(pageId, pageName, score, max) {
      const c = COURSES[_courseSlug] || COURSES.ia101;
      return sendStatement({
        actor: _actor || getActor(),
        verb: VERBS.scored,
        object: {
          objectType: 'Activity',
          id: c.activityBase + pageId + '/quiz',
          definition: {
            name: { 'fr-FR': 'Quiz - ' + pageName },
            type: 'http://adlnet.gov/expapi/activities/assessment'
          }
        },
        result: {
          score: { raw: score, max: max, min: 0, scaled: score / max },
          completion: true,
          success: score === max
        },
        context: getCourseContext(),
        timestamp: new Date().toISOString()
      });
    },

    /**
     * Résultats complets d'un quiz : UN statement 'scored' portant le détail
     * par question et par thème en extensions (base https://akademia.fr/xapi/ext/,
     * cf. docs/pedagogy/integration-spec.md §7).
     * detail = { score, max, passed, durationSeconds, quizType,
     *            answers: [{questionId, theme, question, answer, answerLabel, correctAnswer, correct}],
     *            themes: {theme: {correct, total}}, selfAssessment }
     */
    trackQuizDetail(pageId, pageName, detail) {
      const c = COURSES[_courseSlug] || COURSES.ia101;
      detail = detail || {};
      const max = typeof detail.max === 'number' ? detail.max : 0;
      const statement = {
        actor: _actor || getActor(),
        verb: VERBS.scored,
        object: {
          objectType: 'Activity',
          id: c.activityBase + pageId + '/quiz',
          definition: {
            name: { 'fr-FR': 'Quiz - ' + pageName },
            type: 'http://adlnet.gov/expapi/activities/assessment'
          }
        },
        result: {
          score: { raw: detail.score, max: max, min: 0, scaled: max > 0 ? detail.score / max : 0 },
          completion: true,
          success: typeof detail.passed === 'boolean' ? detail.passed : detail.score === max,
          extensions: {
            'https://akademia.fr/xapi/ext/quiz-type': detail.quizType || 'evaluation',
            'https://akademia.fr/xapi/ext/answers': Array.isArray(detail.answers) ? detail.answers : [],
            'https://akademia.fr/xapi/ext/themes': detail.themes || {}
          }
        },
        context: getCourseContext(),
        timestamp: new Date().toISOString()
      };
      if (detail.selfAssessment) {
        statement.result.extensions['https://akademia.fr/xapi/ext/self-assessment'] = detail.selfAssessment;
      }
      if (typeof detail.durationSeconds === 'number' && !isNaN(detail.durationSeconds)) {
        statement.result.duration = toDuration(detail.durationSeconds);
      }
      return sendStatement(statement);
    },

    trackCompleted(pageId, pageName, durationSeconds) {
      const result = { completion: true };
      if (typeof durationSeconds === 'number' && !isNaN(durationSeconds)) {
        result.duration = toDuration(durationSeconds);
      }
      return sendStatement({
        actor: _actor || getActor(),
        verb: VERBS.completed,
        object: getActivity(pageId, pageName),
        result: result,
        context: getCourseContext(),
        timestamp: new Date().toISOString()
      });
    },

    trackInteraction(pageId, pageName, interactionType) {
      return sendStatement({
        actor: _actor || getActor(),
        verb: VERBS.interacted,
        object: getActivity(pageId, pageName),
        result: {
          extensions: {
            'https://autoformai.fr/xapi/extensions/interaction-type': interactionType
          }
        },
        context: getCourseContext(),
        timestamp: new Date().toISOString()
      });
    },

    trackInitialized(pageId, pageName) {
      return sendStatement({
        actor: _actor || getActor(),
        verb: VERBS.initialized,
        object: getActivity(pageId, pageName),
        context: getCourseContext(),
        timestamp: new Date().toISOString()
      });
    },

    trackPassedFailed(pageId, pageName, score, max, passed) {
      const c = COURSES[_courseSlug] || COURSES.ia101;
      return sendStatement({
        actor: _actor || getActor(),
        verb: passed ? VERBS.passed : VERBS.failed,
        object: {
          objectType: 'Activity',
          id: c.activityBase + pageId + '/quiz',
          definition: {
            name: { 'fr-FR': 'Quiz - ' + pageName },
            type: 'http://adlnet.gov/expapi/activities/assessment'
          }
        },
        result: {
          score: { raw: score, max: max, min: 0, scaled: score / max },
          completion: true,
          success: passed
        },
        context: getCourseContext(),
        timestamp: new Date().toISOString()
      });
    },

    trackTerminated(pageId, pageName, durationSeconds) {
      return sendStatement({
        actor: _actor || getActor(),
        verb: VERBS.terminated,
        object: getActivity(pageId, pageName),
        result: {
          duration: toDuration(durationSeconds)
        },
        context: getCourseContext(),
        timestamp: new Date().toISOString()
      });
    },

    /**
     * Presence heartbeat — proves continuous active time on a sequence.
     * Counts seconds only while the tab is visible; sends a 'progressed'
     * statement every intervalSec with the cumulative active time, so the
     * LRS holds a timestamped trail (regulatory proof of the 15-min online
     * part of a lesson). Returns { getActiveSeconds, stop }.
     */
    startPresenceHeartbeat(pageId, pageName, intervalSec) {
      const c = COURSES[_courseSlug] || COURSES.ia101;
      const interval = Math.max(15, intervalSec || 60);
      let activeSecs = 0;
      let lastTick = Date.now();
      const tick = () => {
        const now = Date.now();
        if (document.visibilityState === 'visible') {
          activeSecs += Math.min(2000, now - lastTick) / 1000;
        }
        lastTick = now;
      };
      const secTimer = setInterval(tick, 1000);
      const sendBeat = () => sendStatement({
        actor: _actor || getActor(),
        verb: VERBS.progressed,
        object: {
          objectType: 'Activity',
          id: c.activityBase + pageId + '/presence',
          definition: {
            name: { 'fr-FR': 'Presence - ' + pageName },
            type: 'http://adlnet.gov/expapi/activities/module'
          }
        },
        result: {
          duration: toDuration(Math.round(activeSecs)),
          extensions: {
            'https://autoformai.fr/xapi/extensions/active-seconds': Math.round(activeSecs)
          }
        },
        context: getCourseContext(),
        timestamp: new Date().toISOString()
      });
      const beatTimer = setInterval(() => { if (activeSecs > 0) sendBeat(); }, interval * 1000);
      return {
        getActiveSeconds: () => Math.round(activeSecs),
        stop: () => { clearInterval(secTimer); clearInterval(beatTimer); return Math.round(activeSecs); }
      };
    },

    trackAnswered(pageId, pageName, questionText, responseText, correct) {
      const c = COURSES[_courseSlug] || COURSES.ia101;
      return sendStatement({
        actor: _actor || getActor(),
        verb: VERBS.answered,
        object: {
          objectType: 'Activity',
          id: c.activityBase + pageId,
          definition: {
            name: { 'fr-FR': pageName },
            type: 'http://adlnet.gov/expapi/activities/cmi.interaction',
            interactionType: 'fill-in',
            description: { 'fr-FR': questionText }
          }
        },
        result: {
          response: responseText,
          success: correct
        },
        context: getCourseContext(),
        timestamp: new Date().toISOString()
      });
    }
  };
})();

// Auto-detect course from URL path
(function() {
  var path = window.location.pathname;
  if (path.indexOf('/konduit/') !== -1) xapiTracker.setCourse('konduit-conduite');
  else if (path.indexOf('/excel/deb-m') !== -1) xapiTracker.setCourse('excel101');
  else if (path.indexOf('/excel/int-m') !== -1) xapiTracker.setCourse('excel201');
  else if (path.indexOf('/excel/avx-m') !== -1) xapiTracker.setCourse('excel301');
  else if (path.indexOf('positionnement-excel301') !== -1) xapiTracker.setCourse('excel301');
  else if (path.indexOf('positionnement-excel201') !== -1) xapiTracker.setCourse('excel201');
  else if (path.indexOf('positionnement-excel101') !== -1 || path.indexOf('quiz-niveau-excel') !== -1) xapiTracker.setCourse('excel101');
  else if (path.indexOf('positionnement-projets-complexes') !== -1) xapiTracker.setCourse('projets-complexes');
  else if (path.indexOf('positionnement-gestion-de-projet') !== -1) xapiTracker.setCourse('gestion-de-projet');
  else if (path.indexOf('positionnement-droit-social-manager') !== -1) xapiTracker.setCourse('droit-social-manager');
  else if (path.indexOf('positionnement-fondamentaux-rh') !== -1) xapiTracker.setCourse('fondamentaux-rh');
  else if (path.indexOf('positionnement-gestion-incidents-cyber') !== -1) xapiTracker.setCourse('gestion-incidents-cyber');
  else if (path.indexOf('positionnement-prevision-ventes-sop') !== -1) xapiTracker.setCourse('prevision-ventes-sop');
  else if (path.indexOf('positionnement-ia-finance') !== -1) xapiTracker.setCourse('ia-finance');
  else if (path.indexOf('-pmo-portefeuille') !== -1) xapiTracker.setCourse('pmo-portefeuille');
})();

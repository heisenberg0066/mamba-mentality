/* Seed data for Mamba Mentality */
const MM_SEED = {
  swedishDeadline: '2027-01-15',
  solidWorksStart: '2026-11-01',
  swedishChapters: [
    // Rivstart A1/A2 ch 7–20 (easy ~20 min)
    { id: 'a1-07', book: 'Rivstart A1/A2', num: 7, title: 'Shopping habits, department store', difficulty: 'easy', mins: 20 },
    { id: 'a1-08', book: 'Rivstart A1/A2', num: 8, title: 'First time in Sweden, karaoke, months, weather, Stockholm', difficulty: 'easy', mins: 20 },
    { id: 'a1-09', book: 'Rivstart A1/A2', num: 9, title: 'Transport, travel in Sweden, itinerary', difficulty: 'easy', mins: 20 },
    { id: 'a1-10', book: 'Rivstart A1/A2', num: 10, title: 'Facts about Sweden, other country', difficulty: 'easy', mins: 20 },
    { id: 'a1-11', book: 'Rivstart A1/A2', num: 11, title: 'Friends/partners, digital problems', difficulty: 'easy', mins: 20 },
    { id: 'a1-12', book: 'Rivstart A1/A2', num: 12, title: 'Food, restaurant, likes/dislikes', difficulty: 'easy', mins: 20 },
    { id: 'a1-13', book: 'Rivstart A1/A2', num: 13, title: 'Jobs, workday, job email', difficulty: 'easy', mins: 20 },
    { id: 'a1-14', book: 'Rivstart A1/A2', num: 14, title: 'Vacation, etiquette, party', difficulty: 'easy', mins: 20 },
    { id: 'a1-15', book: 'Rivstart A1/A2', num: 15, title: 'Typical/atypical, names, small talk', difficulty: 'easy', mins: 20 },
    { id: 'a1-16', book: 'Rivstart A1/A2', num: 16, title: 'School, education, future', difficulty: 'easy', mins: 20 },
    { id: 'a1-17', book: 'Rivstart A1/A2', num: 17, title: 'Housing, buying home, viewing', difficulty: 'easy', mins: 20 },
    { id: 'a1-18', book: 'Rivstart A1/A2', num: 18, title: 'Work, fika, phone, work email', difficulty: 'easy', mins: 20 },
    { id: 'a1-19', book: 'Rivstart A1/A2', num: 19, title: 'Body, doctor, how do you feel', difficulty: 'easy', mins: 20 },
    { id: 'a1-20', book: 'Rivstart A1/A2', num: 20, title: 'News, radio, weather, review', difficulty: 'easy', mins: 20 },
    // Rivstart B1/B2 ch 1–18 (moderate ~60 min)
    { id: 'b1-01', book: 'Rivstart B1/B2', num: 1, title: 'Leisure, history, sports', difficulty: 'moderate', mins: 60 },
    { id: 'b1-02', book: 'Rivstart B1/B2', num: 2, title: 'Friends, art, friendship', difficulty: 'moderate', mins: 60 },
    { id: 'b1-03', book: 'Rivstart B1/B2', num: 3, title: 'Money, economy, dreams', difficulty: 'moderate', mins: 60 },
    { id: 'b1-04', book: 'Rivstart B1/B2', num: 4, title: 'Animals, nature', difficulty: 'moderate', mins: 60 },
    { id: 'b1-05', book: 'Rivstart B1/B2', num: 5, title: 'Everyday life, habits, candy history', difficulty: 'moderate', mins: 60 },
    { id: 'b1-06', book: 'Rivstart B1/B2', num: 6, title: 'Swedish politics, the state', difficulty: 'moderate', mins: 60 },
    { id: 'b1-07', book: 'Rivstart B1/B2', num: 7, title: 'Landscapes, film, food culture', difficulty: 'moderate', mins: 60 },
    { id: 'b1-08', book: 'Rivstart B1/B2', num: 8, title: 'Swedish history, historical figures', difficulty: 'moderate', mins: 60 },
    { id: 'b1-09', book: 'Rivstart B1/B2', num: 9, title: 'Stories, truth/lies, myths', difficulty: 'moderate', mins: 60 },
    { id: 'b1-10', book: 'Rivstart B1/B2', num: 10, title: 'Everyday life, dairy history, S-passive', difficulty: 'moderate', mins: 60 },
    { id: 'b1-11', book: 'Rivstart B1/B2', num: 11, title: 'Crime, punishment, work dilemmas', difficulty: 'moderate', mins: 60 },
    { id: 'b1-12', book: 'Rivstart B1/B2', num: 12, title: 'Moving country, conflicts', difficulty: 'moderate', mins: 60 },
    { id: 'b1-13', book: 'Rivstart B1/B2', num: 13, title: 'Holidays, slang', difficulty: 'moderate', mins: 60 },
    { id: 'b1-14', book: 'Rivstart B1/B2', num: 14, title: 'Optimism/pessimism, consumer rights', difficulty: 'moderate', mins: 60 },
    { id: 'b1-15', book: 'Rivstart B1/B2', num: 15, title: 'Job hunting, interviews', difficulty: 'moderate', mins: 60 },
    { id: 'b1-16', book: 'Rivstart B1/B2', num: 16, title: 'Family, loneliness', difficulty: 'moderate', mins: 60 },
    { id: 'b1-17', book: 'Rivstart B1/B2', num: 17, title: 'Vikings, sagas, supernatural', difficulty: 'moderate', mins: 60 },
    { id: 'b1-18', book: 'Rivstart B1/B2', num: 18, title: 'Labour market, career goals', difficulty: 'moderate', mins: 60 },
    // Språkporten Bas 1–6 (hard 3–5 h)
    { id: 'sp-01', book: 'Språkporten Bas', num: 1, title: 'Samtal', difficulty: 'hard', mins: 240 },
    { id: 'sp-02', book: 'Språkporten Bas', num: 2, title: 'Störst, bäst, värst', difficulty: 'hard', mins: 240 },
    { id: 'sp-03', book: 'Språkporten Bas', num: 3, title: 'Må bra', difficulty: 'hard', mins: 240 },
    { id: 'sp-04', book: 'Språkporten Bas', num: 4, title: 'Val i livet', difficulty: 'hard', mins: 240 },
    { id: 'sp-05', book: 'Språkporten Bas', num: 5, title: 'Språket och litteraturen', difficulty: 'hard', mins: 240 },
    { id: 'sp-06', book: 'Språkporten Bas', num: 6, title: 'Göra skillnad', difficulty: 'hard', mins: 240 }
  ],

  courses: [
    // High priority (KEEP)
    { code: 'MATH 101', title: 'Calculus I', priority: 'high', progress: 0 },
    { code: 'MATH 102', title: 'Calculus II', priority: 'high', progress: 0 },
    { code: 'PHYS 101', title: 'General Physics I', priority: 'high', progress: 0 },
    { code: 'PHYS 102', title: 'General Physics II', priority: 'high', progress: 0 },
    { code: 'ME 201', title: 'Dynamics', priority: 'high', progress: 0 },
    { code: 'ME 203', title: 'Thermodynamics I', priority: 'high', progress: 0 },
    { code: 'ME 204', title: 'Thermodynamics II', priority: 'high', progress: 0 },
    { code: 'ME 210', title: 'ME Drawing and Graphics', priority: 'high', progress: 0 },
    { code: 'ME 216', title: 'Materials Science and Engg.', priority: 'high', progress: 0 },
    { code: 'MATH 201', title: 'Calculus III', priority: 'high', progress: 0 },
    { code: 'MATH 202', title: 'Elements of Differential Equations', priority: 'high', progress: 0 },
    { code: 'EE 204', title: 'Fundamentals of Electrical Circuits', priority: 'high', progress: 0 },
    { code: 'ME 311', title: 'Fluid Mechanics', priority: 'high', progress: 0 },
    { code: 'ME 315', title: 'Heat Transfer', priority: 'high', progress: 0 },
    { code: 'ME 307', title: 'Machine Design I', priority: 'high', progress: 0 },
    { code: 'ME 308', title: 'Machine Design II', priority: 'high', progress: 0 },
    { code: 'ME 309', title: 'Mechanics of Machines', priority: 'high', progress: 0 },
    { code: 'MATH 333', title: 'Methods of Applied Maths. I', priority: 'high', progress: 0 },
    { code: 'ME 413', title: 'Systems Dynamics and Control', priority: 'high', progress: 0 },
    // Quick
    { code: 'CE 201', title: 'Statics', priority: 'quick', progress: 0 },
    { code: 'CE 203', title: 'Structural Mechanics I', priority: 'quick', progress: 0 },
    { code: 'ME 316', title: 'Thermo-Fluid Lab', priority: 'quick', progress: 0 },
    // Later
    { code: 'ME 322', title: 'Manufacturing Processes', priority: 'later', progress: 0 },
    { code: 'ME 451', title: 'Design & Analysis of Engg Experiments', priority: 'later', progress: 0 },
    { code: 'CHEM 101', title: 'General Chemistry I', priority: 'later', progress: 0 },
    { code: 'EE 306', title: 'Electromechanical Devices', priority: 'later', progress: 0 },
    { code: 'AE 449', title: 'Fundamentals of Unmanned Aerial Systems', priority: 'later', progress: 0 },
    { code: 'AE 454', title: 'UAS Design and Integration', priority: 'later', progress: 0 },
    { code: 'CISE 482', title: 'Path Planning & Nav for Mobile Robots', priority: 'later', progress: 0 },
    { code: 'CISE 483', title: 'AI & ML for Robotics', priority: 'later', progress: 0 }
  ],

  // Approximate Stockholm prayer markers (Europe/Stockholm). Updated seasonally in app if needed.
  prayerDefaults: [
    { id: 'fajr', key: 'prayerFajr', time: '05:45' },
    { id: 'dhuhr', key: 'prayerDhuhr', time: '12:40' },
    { id: 'asr', key: 'prayerAsr', time: '15:20' },
    { id: 'maghrib', key: 'prayerMaghrib', time: '17:55' },
    { id: 'isha', key: 'prayerIsha', time: '19:40' }
  ]
};

/** Build default weekly template blocks for a given date (YYYY-MM-DD), respecting settings */
function mmBuildDayTemplate(dateStr, settings, swedishNext, courseFocus) {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay(); // 0 Sun … 6 Sat
  const restDay = settings.restDay || 'sunday'; // 'saturday' | 'sunday'
  const restMovedTo = settings.restMovedTo || null; // weekday 1–5 or null
  const isWeekendRest =
    (restDay === 'sunday' && dow === 0) || (restDay === 'saturday' && dow === 6);
  const isMovedRest = restMovedTo != null && dow === restMovedTo;
  const isRest = isWeekendRest || isMovedRest;
  const jobMode = settings.jobMode || 'none'; // none | part-time | full-time
  const swStart = settings.solidWorksStart || MM_SEED.solidWorksStart;
  const swActive = dateStr >= swStart;
  const isWeekend = dow === 0 || dow === 6;

  if (isRest) {
    const blocks = [
      { id: 'wake', type: 'wake', start: '06:00', end: '06:30', labelKey: 'blockWake' },
      { id: 'rest-morning', type: 'rest', start: '06:30', end: '12:00', labelKey: 'blockRest' },
      { id: 'lunch', type: 'meal', start: '12:00', end: '13:00', labelKey: 'blockLunch' },
      { id: 'meal-prep', type: 'mealprep', start: '13:00', end: '15:00', labelKey: 'blockMealPrep' },
      { id: 'rest-afternoon', type: 'rest', start: '15:00', end: '18:00', labelKey: 'blockRest' },
      { id: 'dinner', type: 'meal', start: '18:00', end: '19:00', labelKey: 'blockDinner' },
      { id: 'chill', type: 'chill', start: '19:00', end: '22:00', labelKey: 'blockChill' },
      { id: 'wind', type: 'wind', start: '22:00', end: '00:00', labelKey: 'blockWind' }
    ];
    return { isRest: true, blocks };
  }

  // Scale durations by job mode
  let jobMins = 150, swedishMins = 60, revisionMins = 120, swMins = 120, deepMins = 120, chillMins = 180;
  if (jobMode === 'part-time') {
    jobMins = 60; swedishMins = 40; revisionMins = 75; swMins = 75; deepMins = 75; chillMins = 120;
  } else if (jobMode === 'full-time') {
    jobMins = 0; swedishMins = 15; revisionMins = 45; swMins = 60; deepMins = 45; chillMins = 90;
  }

  const blocks = [];
  const push = (id, type, start, end, labelKey, meta) => {
    blocks.push({ id, type, start, end, labelKey, meta: meta || {} });
  };

  push('wake', 'wake', '06:00', '06:30', 'blockWake');

  let cursor = '06:30';
  const addMins = (hhmm, m) => {
    const [h, mi] = hhmm.split(':').map(Number);
    let t = h * 60 + mi + m;
    if (t >= 24 * 60) t -= 24 * 60;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  };

  if (jobMins > 0) {
    const end = addMins(cursor, jobMins);
    push('jobs', 'jobs', cursor, end, 'blockJobs', { detail: 'ME + retail' });
    cursor = end;
  }

  {
    const end = addMins(cursor, swedishMins);
    const detail = swedishNext
      ? `${swedishNext.book} ch.${swedishNext.num}: ${swedishNext.title}`
      : '';
    push('swedish', 'swedish', cursor, end, 'blockSwedish', { detail, chapterId: swedishNext && swedishNext.id });
    cursor = end;
  }

  {
    const end = addMins(cursor, revisionMins);
    const detail = courseFocus ? `${courseFocus.code} — ${courseFocus.title}` : '';
    push('revision', 'revision', cursor, end, 'blockRevision', { detail, courseCode: courseFocus && courseFocus.code });
    cursor = end;
  }

  // Align lunch around noon if we've overrun or are early
  if (cursor < '12:00') cursor = '12:00';
  push('lunch', 'meal', cursor, addMins(cursor, 60), 'blockLunch');
  cursor = addMins(cursor, 60);

  if (swActive && swMins > 0) {
    const end = addMins(cursor, swMins);
    push('solidworks', 'solidworks', cursor, end, 'blockSolidWorks', { detail: 'part / small assembly' });
    cursor = end;
  } else if (!swActive) {
    const end = addMins(cursor, Math.max(60, revisionMins));
    push('revision2', 'revision', cursor, end, 'blockRevisionMore', { detail: courseFocus ? courseFocus.code : '' });
    cursor = end;
  }

  // Buffer
  push('buffer', 'buffer', cursor, addMins(cursor, 60), 'blockBuffer');
  cursor = addMins(cursor, 60);

  {
    const end = addMins(cursor, deepMins);
    push('deep', 'deep', cursor, end, 'blockDeep', {
      detail: swedishNext && swedishNext.difficulty === 'hard' ? 'Swedish hard chapter' : 'revision / Swedish'
    });
    cursor = end;
  }

  if (cursor < '18:00') cursor = '18:00';
  push('dinner', 'meal', cursor, addMins(cursor, 60), 'blockDinner');
  cursor = addMins(cursor, 60);

  // Chill until ~22:00
  let chillEnd = '22:00';
  if (cursor >= chillEnd) chillEnd = addMins(cursor, Math.max(60, chillMins));
  push('chill', 'chill', cursor, chillEnd, 'blockChill');
  cursor = chillEnd;

  push('wind', 'wind', cursor, '00:00', 'blockWind');

  if (isWeekend) {
    // non-rest weekend day: the buffer hour becomes weekend meal prep
    const buf = blocks.find((b) => b.id === 'buffer');
    if (buf) { buf.id = 'meal-prep'; buf.type = 'mealprep'; buf.labelKey = 'blockMealPrep'; }
  }

  return { isRest: false, blocks };
}

/* ===== v2 seeds ===== */
const MM_TOPICS = {
  'MATH 101': ['Limits & continuity','Derivatives & rules','Chain rule & implicit differentiation','Applications: rates & optimization','Curve sketching','Antiderivatives','Definite integral & FTC','Substitution'],
  'MATH 102': ['Integration by parts & trig integrals','Partial fractions','Improper integrals','Area, volume, arc length','Parametric & polar','Sequences','Series & convergence tests','Power & Taylor series'],
  'PHYS 101': ['Kinematics 1D/2D','Newton\'s laws','Work & energy','Momentum & collisions','Rotation & torque','Angular momentum','Gravitation','Oscillations'],
  'PHYS 102': ['Electric charge & field','Gauss\'s law','Electric potential','Capacitance','Current, resistance & DC circuits','Magnetic field & force','Ampère & Faraday','Inductance & AC basics'],
  'ME 201': ['Particle kinematics (rect, n-t, polar)','Particle kinetics F=ma','Work-energy (particles)','Impulse-momentum & impact','Rigid body kinematics','Relative motion & instant centre','Rigid body kinetics','Rigid body energy & momentum'],
  'ME 203': ['Properties of pure substances & tables','Ideal gas','Energy, work & heat','First law: closed systems','First law: open systems (CV)','Second law & heat engines','Carnot cycle','Entropy & isentropic efficiency'],
  'ME 204': ['Exergy','Gas power cycles (Otto, Diesel, Brayton)','Vapour power cycles (Rankine)','Refrigeration cycles','Gas mixtures','Psychrometrics & HVAC','Combustion'],
  'ME 210': ['Orthographic projection','Sectional views','Auxiliary views','Dimensioning & tolerancing','GD&T basics','Fits & limits','Assembly drawings & BOM','Threads & fasteners'],
  'ME 216': ['Atomic structure & bonding','Crystal structures','Imperfections & diffusion','Mechanical properties','Dislocations & strengthening','Failure: fracture, fatigue, creep','Phase diagrams (Fe-C)','Heat treatment','Polymers, ceramics, composites','Corrosion'],
  'MATH 201': ['Vectors & 3D geometry','Vector functions & curves','Partial derivatives','Gradient & directional derivative','Extrema & Lagrange multipliers','Double integrals','Triple integrals','Line & surface integrals','Green, Stokes, Divergence'],
  'MATH 202': ['First-order ODEs','Applications of first-order ODEs','Second-order linear ODEs','Undetermined coeffs & variation of parameters','Mechanical vibrations','Laplace transform','Systems of ODEs','Series solutions'],
  'EE 204': ['Circuit variables & elements','KCL / KVL','Nodal & mesh analysis','Thevenin, Norton, superposition','Op-amps','RC/RL transients','RLC circuits','AC phasors','AC power'],
  'ME 311': ['Fluid properties','Statics & manometry','Hydrostatic forces','Bernoulli equation','CV: mass, momentum, energy','Dimensional analysis & similitude','Pipe flow & losses (Moody)','External flow, drag & lift'],
  'ME 315': ['1D steady conduction','Thermal resistance & fins','Transient conduction','External forced convection','Internal forced convection','Natural convection','Heat exchangers (LMTD, ε-NTU)','Radiation'],
  'ME 307': ['Stress analysis & combined loading','Static failure theories','Fatigue (S-N, Goodman)','Shafts','Keys & couplings','Screws & fasteners','Welded joints','Springs'],
  'ME 308': ['Rolling bearings','Journal bearings & lubrication','Spur gears','Helical, bevel & worm gears','Clutches & brakes','Belts & chains','Flywheels'],
  'ME 309': ['Mechanisms & mobility','Linkage position analysis','Velocity analysis','Acceleration analysis','Cams','Gear trains','Force analysis','Balancing'],
  'MATH 333': ['Matrices & linear systems','Eigenvalues & eigenvectors','Systems of ODEs via matrices','Fourier series','Separation of variables','Heat equation','Wave equation','Laplace equation'],
  'ME 413': ['Modelling mechanical systems','Electrical & electromechanical models','Laplace & transfer functions','Block diagrams','1st/2nd order time response','Stability & Routh','Steady-state error','Root locus','Frequency response & Bode','PID control'],
  'CE 201': ['Force vectors','Particle equilibrium','Moments & couples','Rigid body equilibrium','Trusses','Frames & machines','Centroids','Moments of inertia','Friction'],
  'CE 203': ['Stress & strain','Axial loading','Torsion','Bending stress','Shear in beams','Stress transformation & Mohr','Beam deflection','Buckling'],
  'ME 316': ['Flow measurement lab','Pipe friction lab','Heat exchanger lab','Conduction/convection lab','Uncertainty analysis'],
  'ME 322': ['Casting','Forming','Machining','Welding & joining','Additive manufacturing'],
  'ME 451': ['Experiment planning','Statistics & uncertainty','Regression','Factorial design'],
  'CHEM 101': ['Stoichiometry','Atomic structure','Bonding','Gases','Thermochemistry'],
  'EE 306': ['Magnetic circuits','Transformers','DC machines','Induction motors'],
  'AE 449': ['UAS overview & regulations','Aerodynamics basics','Propulsion & power','Sensors & autopilot'],
  'AE 454': ['Mission requirements','Airframe sizing','Avionics integration','Flight testing'],
  'CISE 482': ['Configuration space','Graph search (A*, Dijkstra)','Sampling planners (RRT, PRM)','Localisation & SLAM basics'],
  'CISE 483': ['ML basics','Neural networks','Perception for robots','Reinforcement learning']
};

const MM_SW_ITEMS = [
  'Part from drawing sheet (speed run)',
  'Equations & global variables',
  'Configurations & design tables',
  'Mass properties checks',
  'Part modification under time',
  'Assembly mates (standard & advanced)',
  'Assembly coordinate system & COM',
  'Collision / interference detection',
  'Replace components in assembly',
  'Full CSWP mock exam'
];

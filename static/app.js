// Global State Variables
let teacher = null;
let classes = [];
let currentClassId = null;
let currentMonth = new Date().getMonth() + 1; // 1-12
let currentYear = 2026;
let currentMarkMode = 'present'; // 'present', 'personal', 'sick', 'absent'
let activeTab = 'rollcall'; // 'rollcall', 'students', 'summary'
let students = []; // List of students in active class
let attendanceState = {}; // Key: "studentId-date", Val: 'present'/'personal'/'sick'
let holidaySet = new Set([
  '1-1',
  '2-16', '2-17', '2-18', '2-19', '2-20', '2-27',
  '4-3', '4-6',
  '5-1',
  '6-19',
  '9-25', '9-28',
  '10-9', '10-26',
  '12-25'
]);

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

// --- Helper Functions ---
function getCellKey(studentId, dateStr) {
  return `${studentId}-${dateStr}`;
}

function getFormattedDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isWeekend(year, month, day) {
  return new Date(year, month - 1, day).getDay() % 6 === 0;
}

function isHoliday(month, day) {
  return holidaySet.has(`${month}-${day}`);
}

function isNonClassDay(year, month, day) {
  return isWeekend(year, month, day) || isHoliday(month, day);
}

function getWeekdayCount(year, month) {
  let count = 0;
  const totalDays = DAYS_IN_MONTH[month - 1];
  for (let d = 1; d <= totalDays; d++) {
    if (!isNonClassDay(year, month, d)) count++;
  }
  return count;
}

// --- Loading indicator ---
function showLoading(show) {
  const backdrop = document.getElementById('loading-backdrop');
  if (show) backdrop.classList.remove('hidden');
  else backdrop.classList.add('hidden');
}

// --- Status sync indicator ---
function setSyncStatus(status) {
  const el = document.getElementById('sync-status');
  const span = el.querySelector('span');
  const icon = el.querySelector('i');
  
  if (status === 'syncing') {
    el.className = 'text-xs bg-amber-800 text-amber-200 px-3 py-1.5 rounded-full flex items-center space-x-2';
    span.textContent = '同步中...';
    icon.className = 'fa-solid fa-arrows-rotate animate-spin text-amber-400';
  } else if (status === 'synced') {
    el.className = 'text-xs bg-blue-800 text-blue-200 px-3 py-1.5 rounded-full flex items-center space-x-2';
    span.textContent = '雲端已同步';
    icon.className = 'fa-solid fa-cloud-check text-green-400';
  } else if (status === 'error') {
    el.className = 'text-xs bg-rose-800 text-rose-200 px-3 py-1.5 rounded-full flex items-center space-x-2';
    span.textContent = '網路通訊錯誤';
    icon.className = 'fa-solid fa-cloud-exclamation text-rose-400';
  }
}

// --- API Calls ---
async function fetchAPI(url, options = {}) {
  try {
    const res = await fetch(url, options);
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('請先登入');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'API 呼叫失敗');
    }
    return await res.json();
  } catch (err) {
    console.error(err);
    throw err;
  }
}

// 1. Classes API
async function loadClasses() {
  classes = await fetchAPI('/api/classes');
  renderClassList();
  if (classes.length > 0 && !currentClassId) {
    await selectClass(classes[0].id);
  }
}

async function selectClass(classId) {
  currentClassId = classId;
  const currentClass = classes.find(c => c.id === classId);
  document.getElementById('current-class-title').textContent = currentClass ? currentClass.name : '選擇班級';
  
  // Render sidebar active states
  document.querySelectorAll('.class-btn').forEach(b => {
    b.classList.toggle('bg-blue-50', parseInt(b.dataset.id) === classId);
    b.classList.toggle('text-blue-700', parseInt(b.dataset.id) === classId);
    b.classList.toggle('font-bold', parseInt(b.dataset.id) === classId);
  });
  
  showLoading(true);
  await loadStudents();
  await loadAttendance();
  showLoading(false);
  
  refreshActiveView();
}

async function promptCreateClass() {
  const name = prompt('請輸入新班級名稱：');
  if (!name || !name.trim()) return;
  
  showLoading(true);
  try {
    const newClass = await fetchAPI('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() })
    });
    classes.push(newClass);
    renderClassList();
    await selectClass(newClass.id);
  } finally {
    showLoading(false);
  }
}

async function promptRenameClass() {
  if (!currentClassId) return;
  const currentClass = classes.find(c => c.id === currentClassId);
  if (!currentClass) return;
  
  const name = prompt('修改班級名稱：', currentClass.name);
  if (!name || !name.trim() || name.trim() === currentClass.name) return;
  
  showLoading(true);
  try {
    const updated = await fetchAPI(`/api/classes/${currentClassId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() })
    });
    currentClass.name = updated.name;
    document.getElementById('current-class-title').textContent = updated.name;
    renderClassList();
    selectClass(currentClassId);
  } finally {
    showLoading(false);
  }
}

async function deleteCurrentClass() {
  if (!currentClassId) return;
  if (!confirm('警告：這將會永久刪除此班級，以及該班級的所有學生和點名紀錄！此動作無法復原。確認刪除嗎？')) return;
  
  showLoading(true);
  try {
    await fetchAPI(`/api/classes/${currentClassId}`, { method: 'DELETE' });
    classes = classes.filter(c => c.id !== currentClassId);
    renderClassList();
    currentClassId = null;
    if (classes.length > 0) {
      await selectClass(classes[0].id);
    } else {
      document.getElementById('current-class-title').textContent = '無可用班級';
      students = [];
      refreshActiveView();
    }
  } finally {
    showLoading(false);
  }
}

function renderClassList() {
  const list = document.getElementById('class-list');
  list.innerHTML = '';
  classes.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'class-btn w-full text-left px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition flex justify-between items-center';
    btn.dataset.id = c.id;
    btn.onclick = () => selectClass(c.id);
    btn.innerHTML = `
      <span class="truncate flex items-center space-x-2">
        <i class="fa-solid fa-chalkboard text-slate-400"></i>
        <span>${c.name}</span>
      </span>
      <i class="fa-solid fa-chevron-right text-xs text-slate-300"></i>
    `;
    list.appendChild(btn);
  });
}

// 2. Students API
async function loadStudents() {
  if (!currentClassId) return;
  students = await fetchAPI(`/api/classes/${currentClassId}/students`);
  document.getElementById('roster-count-txt').textContent = `${students.length} 人`;
}

async function saveStudent(event) {
  event.preventDefault();
  if (!currentClassId) return;
  
  const studentId = document.getElementById('edit-student-id').value;
  const seatNum = parseInt(document.getElementById('student-seat-input').value);
  const name = document.getElementById('student-name-input').value.trim();
  
  const payload = { seat_num: seatNum, name: name };
  showLoading(true);
  try {
    if (studentId) {
      // Edit
      const updated = await fetchAPI(`/api/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      students = students.map(s => s.id === updated.id ? { ...s, ...updated } : s);
    } else {
      // Create
      const created = await fetchAPI(`/api/classes/${currentClassId}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      students.push(created);
    }
    students.sort((a, b) => a.seat_num - b.seat_num);
    clearStudentForm();
    await loadStudents();
    await loadAttendance(); // Reload state structure for changes
    refreshActiveView();
  } finally {
    showLoading(false);
  }
}

async function deleteStudent(studentId) {
  if (!confirm('確定刪除此位學生及其點名資料嗎？此動作無法復原。')) return;
  showLoading(true);
  try {
    await fetchAPI(`/api/students/${studentId}`, { method: 'DELETE' });
    students = students.filter(s => s.id !== studentId);
    await loadStudents();
    await loadAttendance();
    refreshActiveView();
  } finally {
    showLoading(false);
  }
}

function clearStudentForm() {
  document.getElementById('edit-student-id').value = '';
  document.getElementById('student-seat-input').value = '';
  document.getElementById('student-name-input').value = '';
  document.getElementById('add-student-btn').textContent = '確認新增';
  document.getElementById('cancel-edit-btn').classList.add('hidden');
}

function fillEditStudentForm(id, seatNum, name) {
  document.getElementById('edit-student-id').value = id;
  document.getElementById('student-seat-input').value = seatNum;
  document.getElementById('student-name-input').value = name;
  document.getElementById('add-student-btn').textContent = '儲存修改';
  document.getElementById('cancel-edit-btn').classList.remove('hidden');
}

// 3. Attendance API
async function loadAttendance() {
  if (!currentClassId) return;
  attendanceState = {};
  const records = await fetchAPI(`/api/attendance?class_id=${currentClassId}&year=${currentYear}&month=${currentMonth}`);
  records.forEach(rec => {
    attendanceState[getCellKey(rec.student_id, rec.date)] = rec.status;
  });
}

async function syncAttendanceRecord(studentId, dateStr, status) {
  setSyncStatus('syncing');
  try {
    await fetchAPI('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: [{ student_id: studentId, date: dateStr, status: status }]
      })
    });
    setSyncStatus('synced');
  } catch (err) {
    setSyncStatus('error');
  }
}

// --- View Controlling & Navigation ---
function setActiveTab(tab) {
  activeTab = tab;
  
  // Tab Button active states
  document.querySelectorAll('nav button').forEach(b => {
    b.classList.remove('bg-blue-50', 'text-blue-700', 'active');
    b.classList.add('text-slate-600');
  });
  
  const activeBtn = document.getElementById(`tab-${tab}-btn`);
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-600');
    activeBtn.classList.add('bg-blue-50', 'text-blue-700', 'active');
  }
  
  // Show/Hide views
  document.querySelectorAll('.view-content').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${tab}`).classList.remove('hidden');
  
  // Toolbar controls hide/show logic
  const toolbar = document.getElementById('main-toolbar');
  if (tab === 'students') {
    toolbar.classList.add('hidden');
  } else {
    toolbar.classList.remove('hidden');
  }
  
  refreshActiveView();
}

function refreshActiveView() {
  if (activeTab === 'rollcall') {
    renderRollCallGrid();
    renderMonthlyStats();
  } else if (activeTab === 'students') {
    renderRosterList();
  } else if (activeTab === 'summary') {
    renderAnnualSummary();
  }
}

function setMarkMode(mode) {
  currentMarkMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.remove('border-emerald-300', 'border-amber-300', 'border-purple-300', 'border-rose-300', 'shadow-sm', 'active');
    b.classList.add('border-transparent');
  });
  
  const activeBtn = document.getElementById(`mode-${mode}`);
  if (activeBtn) {
    activeBtn.classList.remove('border-transparent');
    let colorClass = 'border-slate-300';
    if (mode === 'present') colorClass = 'border-emerald-300';
    else if (mode === 'personal') colorClass = 'border-amber-300';
    else if (mode === 'sick') colorClass = 'border-purple-300';
    else if (mode === 'absent') colorClass = 'border-rose-300';
    
    activeBtn.classList.add(colorClass, 'shadow-sm', 'active');
  }
}

// --- View Rendering ---

// 12 Months Tabs Render
function renderMonthTabs() {
  const row = document.getElementById('month-tabs-row');
  row.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const btn = document.createElement('button');
    btn.className = `px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition text-slate-500 border-slate-200 hover:bg-slate-50 ${m === currentMonth ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-100 hover:bg-blue-600' : ''}`;
    btn.textContent = `${m}月`;
    btn.onclick = async () => {
      currentMonth = m;
      renderMonthTabs();
      showLoading(true);
      await loadAttendance();
      showLoading(false);
      refreshActiveView();
    };
    row.appendChild(btn);
  }
}

async function onYearChange() {
  currentYear = parseInt(document.getElementById('year-select').value);
  showLoading(true);
  await loadAttendance();
  showLoading(false);
  refreshActiveView();
}

// GRID Render for Roll Call
function renderRollCallGrid() {
  const table = document.getElementById('rollcall-grid-table');
  table.innerHTML = '';
  
  if (students.length === 0) {
    table.innerHTML = `<tr><td class="p-8 text-slate-400 text-center font-medium">本班級尚無學生，請至「班級學生管理」新增。</td></tr>`;
    return;
  }
  
  const days = DAYS_IN_MONTH[currentMonth - 1];
  
  // Grid Header (Day numbers and weekdays)
  let headerHTML = `<thead><tr class="bg-blue-900 text-white font-bold text-xs">`;
  headerHTML += `<th class="sticky-col-header py-3 px-3 w-10 text-center shadow-[2px_0_5px_rgba(0,0,0,0.1)]">座號</th>`;
  headerHTML += `<th class="sticky-col-header py-3 px-4 w-24 text-left shadow-[2px_0_5px_rgba(0,0,0,0.1)]" style="left:40px">姓名</th>`;
  for (let d = 1; d <= days; d++) {
    const isWe = isWeekend(currentYear, currentMonth, d);
    const isHol = isHoliday(currentMonth, d);
    
    let bgStyle = '';
    if (isWe) bgStyle = 'background-color:#94a3b8;color:#1e293b;';
    else if (isHol) bgStyle = 'background-color:#fca5a5;color:#991b1b;';
    
    const dayOfWeek = WEEKDAYS[new Date(currentYear, currentMonth - 1, d).getDay()];
    headerHTML += `<th class="p-1 px-1.5" style="${bgStyle}">${d}<br><span class="text-[9px] font-normal opacity-85">${dayOfWeek}</span></th>`;
  }
  headerHTML += `</tr></thead>`;
  
  // Grid Body (Students with cells)
  let bodyHTML = `<tbody>`;
  students.forEach((s) => {
    bodyHTML += `<tr class="border-b border-slate-100 hover:bg-slate-50">`;
    bodyHTML += `<td class="sticky-col py-2.5 px-3 font-semibold text-center border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.03)]">${s.seat_num}</td>`;
    bodyHTML += `<td class="sticky-col py-2.5 px-4 font-bold text-left border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.03)] truncate" style="left:40px">${s.name}</td>`;
    
    for (let d = 1; d <= days; d++) {
      const isWe = isWeekend(currentYear, currentMonth, d);
      const isHol = isHoliday(currentMonth, d);
      const nc = isWe || isHol;
      const dateStr = getFormattedDate(currentYear, currentMonth, d);
      const st = attendanceState[getCellKey(s.id, dateStr)] || 'absent';
      
      let cellCls = 'day-cell border-r border-slate-100 cursor-pointer text-center font-bold ';
      let cellTxt = '';
      
      if (isWe) cellCls += 'bg-slate-100 cursor-not-allowed pointer-events-none';
      else if (isHol) cellCls += 'bg-red-50 cursor-not-allowed pointer-events-none';
      
      if (!nc) {
        if (st === 'present') {
          cellCls += 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100';
          cellTxt = '✓';
        } else if (st === 'personal') {
          cellCls += 'bg-amber-50 text-amber-600 hover:bg-amber-100';
          cellTxt = '事';
        } else if (st === 'sick') {
          cellCls += 'bg-purple-50 text-purple-600 hover:bg-purple-100';
          cellTxt = '病';
        } else {
          cellCls += 'hover:bg-slate-100';
          cellTxt = '';
        }
      }
      
      bodyHTML += `<td class="${cellCls}" data-student="${s.id}" data-date="${dateStr}" data-nc="${nc}" onclick="onCellClick(this)">${cellTxt}</td>`;
    }
    bodyHTML += `</tr>`;
  });
  bodyHTML += `</tbody>`;
  
  table.innerHTML = headerHTML + bodyHTML;
}

// Cell click handler
function onCellClick(td) {
  if (td.dataset.nc === 'true') return;
  
  const studentId = parseInt(td.dataset.student);
  const dateStr = td.dataset.date;
  const key = getCellKey(studentId, dateStr);
  const prev = attendanceState[key] || 'absent';
  
  let next;
  if (currentMarkMode === 'present') next = prev === 'present' ? 'absent' : 'present';
  else if (currentMarkMode === 'personal') next = prev === 'personal' ? 'absent' : 'personal';
  else if (currentMarkMode === 'sick') next = prev === 'sick' ? 'absent' : 'sick';
  else next = 'absent';
  
  // Update state locally
  if (next === 'absent') delete attendanceState[key];
  else attendanceState[key] = next;
  
  // Re-render only clicked cell
  td.className = 'day-cell border-r border-slate-100 cursor-pointer text-center font-bold ';
  if (next === 'present') {
    td.className += 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100';
    td.textContent = '✓';
  } else if (next === 'personal') {
    td.className += 'bg-amber-50 text-amber-600 hover:bg-amber-100';
    td.textContent = '事';
  } else if (next === 'sick') {
    td.className += 'bg-purple-50 text-purple-600 hover:bg-purple-100';
    td.textContent = '病';
  } else {
    td.className += 'hover:bg-slate-100';
    td.textContent = '';
  }
  
  // Sync to Backend Database in the background
  syncAttendanceRecord(studentId, dateStr, next);
  
  // Instantly re-calculate statistics
  renderMonthlyStats();
}

// Helper: Calculate counts for a month
function calculateMonthCounts(studentId) {
  const days = DAYS_IN_MONTH[currentMonth - 1];
  let present = 0, personal = 0, sick = 0, absent = 0;
  
  for (let d = 1; d <= days; d++) {
    if (isNonClassDay(currentYear, currentMonth, d)) continue;
    const dateStr = getFormattedDate(currentYear, currentMonth, d);
    const st = attendanceState[getCellKey(studentId, dateStr)] || 'absent';
    
    if (st === 'present') present++;
    else if (st === 'personal') personal++;
    else if (st === 'sick') sick++;
    else absent++;
  }
  
  return { present, personal, sick, absent };
}

// Render monthly summary list
function renderMonthlyStats() {
  const tbody = document.getElementById('monthly-stats-tbody');
  tbody.innerHTML = '';
  document.getElementById('monthly-stats-heading').textContent = `▼ ${currentMonth}月 缺課統計`;
  
  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-slate-400 font-medium">尚無學生統計資料。</td></tr>`;
    return;
  }
  
  const classDays = getWeekdayCount(currentYear, currentMonth);
  
  students.forEach((s) => {
    const { present, personal, sick, absent } = calculateMonthCounts(s.id);
    const totalAbsent = personal + sick + absent;
    const rate = classDays > 0 ? totalAbsent / classDays : 0;
    
    let rateCls = 'text-green-600 font-bold bg-green-50 px-2.5 py-1 rounded-full text-xs';
    if (rate > 0 && rate <= 0.2) rateCls = 'text-amber-600 font-bold bg-amber-50 px-2.5 py-1 rounded-full text-xs';
    else if (rate > 0.2) rateCls = 'text-rose-600 font-bold bg-rose-50 px-2.5 py-1 rounded-full text-xs';
    
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 hover:bg-slate-50/50';
    tr.innerHTML = `
      <td class="py-2.5 px-3 text-center font-semibold text-slate-500">${s.seat_num}</td>
      <td class="py-2.5 px-3 font-bold text-slate-700">${s.name}</td>
      <td class="py-2.5 px-3 text-center font-medium text-emerald-600 bg-emerald-50/20">${present}</td>
      <td class="py-2.5 px-3 text-center font-medium text-amber-600 bg-amber-50/20">${personal}</td>
      <td class="py-2.5 px-3 text-center font-medium text-purple-600 bg-purple-50/20">${sick}</td>
      <td class="py-2.5 px-3 text-center font-medium text-slate-400">${absent}</td>
      <td class="py-2.5 px-3 text-center"><span class="${rateCls}">${(rate * 100).toFixed(1)}%</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Bulk Mark Attendance
async function markAllStudentsPresent() {
  if (students.length === 0) return;
  const days = DAYS_IN_MONTH[currentMonth - 1];
  const payloadRecords = [];
  
  showLoading(true);
  for (let s of students) {
    for (let d = 1; d <= days; d++) {
      if (!isNonClassDay(currentYear, currentMonth, d)) {
        const dateStr = getFormattedDate(currentYear, currentMonth, d);
        const key = getCellKey(s.id, dateStr);
        attendanceState[key] = 'present';
        payloadRecords.push({ student_id: s.id, date: dateStr, status: 'present' });
      }
    }
  }
  
  try {
    await fetchAPI('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: payloadRecords })
    });
    setSyncStatus('synced');
  } catch (err) {
    setSyncStatus('error');
  } finally {
    showLoading(false);
  }
  
  refreshActiveView();
}

async function resetCurrentMonth() {
  if (students.length === 0) return;
  if (!confirm(`確定清除 ${currentMonth}月的所有點名記錄嗎？此操作將會清除所有學生的點名與請假資料。`)) return;
  
  const days = DAYS_IN_MONTH[currentMonth - 1];
  const payloadRecords = [];
  
  showLoading(true);
  for (let s of students) {
    for (let d = 1; d <= days; d++) {
      if (!isNonClassDay(currentYear, currentMonth, d)) {
        const dateStr = getFormattedDate(currentYear, currentMonth, d);
        const key = getCellKey(s.id, dateStr);
        delete attendanceState[key];
        payloadRecords.push({ student_id: s.id, date: dateStr, status: 'absent' });
      }
    }
  }
  
  try {
    await fetchAPI('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: payloadRecords })
    });
    setSyncStatus('synced');
  } catch (err) {
    setSyncStatus('error');
  } finally {
    showLoading(false);
  }
  
  refreshActiveView();
}

// Student Roster Tab Renderer
function renderRosterList() {
  const tbody = document.getElementById('student-roster-tbody');
  tbody.innerHTML = '';
  
  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-slate-400 font-medium">目前尚無學生資料。請在左側表單中新增第一位學生。</td></tr>`;
    return;
  }
  
  students.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-150 hover:bg-slate-50 transition';
    tr.innerHTML = `
      <td class="py-3 px-4 text-center font-bold text-slate-500">${s.seat_num}</td>
      <td class="py-3 px-4 font-bold text-slate-700 text-sm">${s.name}</td>
      <td class="py-3 px-4 text-right no-print space-x-2">
        <button onclick="fillEditStudentForm(${s.id}, ${s.seat_num}, '${s.name}')" class="text-blue-600 hover:text-blue-800 font-semibold text-xs hover:underline bg-blue-50 px-2.5 py-1 rounded transition">
          <i class="fa-solid fa-pen mr-1"></i>編輯
        </button>
        <button onclick="deleteStudent(${s.id})" class="text-rose-600 hover:text-rose-800 font-semibold text-xs hover:underline bg-rose-50 px-2.5 py-1 rounded transition">
          <i class="fa-solid fa-trash-can mr-1"></i>刪除
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Annual Summary View (fetches for all months)
async function renderAnnualSummary() {
  const table = document.getElementById('annual-summary-table');
  table.innerHTML = '';
  
  if (students.length === 0) {
    table.innerHTML = `<tr><td class="p-8 text-slate-400 text-center font-medium">本班級無學生，請至「學生管理」新增。</td></tr>`;
    return;
  }
  
  showLoading(true);
  
  // Load ALL records for the whole year at once from backend API
  let allRecords = [];
  try {
    allRecords = await fetchAPI(`/api/stats?class_id=${currentClassId}&year=${currentYear}`);
  } finally {
    showLoading(false);
  }
  
  // Aggregate records by student and month
  const yearlyData = {}; // student_id -> month (1-12) -> status counts
  students.forEach(s => {
    yearlyData[s.id] = {};
    for (let m = 1; m <= 12; m++) {
      yearlyData[s.id][m] = { personal: 0, sick: 0, absent: 0 };
    }
  });
  
  allRecords.forEach(rec => {
    const studentId = rec.student_id;
    if (!yearlyData[studentId]) return;
    
    const dateObj = new Date(rec.date);
    const month = dateObj.getMonth() + 1;
    const status = rec.status;
    
    // Increment specific type of absence if relevant
    if (status !== 'present') {
      if (status === 'personal') yearlyData[studentId][month].personal++;
      else if (status === 'sick') yearlyData[studentId][month].sick++;
      else yearlyData[studentId][month].absent++;
    }
  });
  
  // Table header
  let html = `<thead><tr class="bg-blue-900 text-white font-bold">`;
  html += `<th class="py-3 px-3 w-16 text-center border-r border-blue-800">座號</th>`;
  html += `<th class="py-3 px-4 w-28 text-left border-r border-blue-800">姓名</th>`;
  for (let m = 1; m <= 12; m++) {
    html += `<th class="py-2.5 px-2 border-r border-blue-800">${m}月</th>`;
  }
  html += `<th class="py-3 px-3 bg-slate-800 text-white">平均缺課率</th></tr></thead><tbody>`;
  
  // Calculate and populate rows
  students.forEach(s => {
    let totalRateSum = 0;
    html += `<tr class="border-b border-slate-100 hover:bg-slate-50 transition">`;
    html += `<td class="py-2.5 px-3 text-center font-bold text-slate-500 border-r border-slate-100">${s.seat_num}</td>`;
    html += `<td class="py-2.5 px-4 text-left font-bold text-slate-700 border-r border-slate-100 truncate">${s.name}</td>`;
    
    for (let m = 1; m <= 12; m++) {
      const classDays = getWeekdayCount(currentYear, m);
      const { personal, sick, absent } = yearlyData[s.id][m];
      const totalAbs = personal + sick + absent;
      const rate = classDays > 0 ? totalAbs / classDays : 0;
      totalRateSum += rate;
      
      let badgeCls = 'text-green-600 bg-green-50/60 font-semibold px-2 py-0.5 rounded text-[11px]';
      if (rate > 0 && rate <= 0.2) badgeCls = 'text-amber-600 bg-amber-50/60 font-semibold px-2 py-0.5 rounded text-[11px]';
      else if (rate > 0.2) badgeCls = 'text-rose-600 bg-rose-50/60 font-bold px-2 py-0.5 rounded text-[11px]';
      
      html += `<td class="py-2 px-1 border-r border-slate-100 text-center"><span class="${badgeCls}">${(rate * 100).toFixed(1)}%</span></td>`;
    }
    
    const avgRate = totalRateSum / 12;
    let avgCls = 'text-green-600 font-bold';
    if (avgRate > 0 && avgRate <= 0.2) avgCls = 'text-amber-600 font-bold';
    else if (avgRate > 0.2) avgCls = 'text-rose-600 font-bold';
    
    html += `<td class="py-2.5 px-3 text-center bg-slate-50 font-bold border-l border-slate-200 ${avgCls}">${(avgRate * 100).toFixed(1)}%</td>`;
    html += `</tr>`;
  });
  html += `</tbody>`;
  
  table.innerHTML = html;
}

// --- Batch Import ---
function openBatchImport() {
  document.getElementById('batch-modal').classList.remove('hidden');
  document.getElementById('batch-textarea').value = '';
  document.getElementById('batch-result').classList.add('hidden');
}

function closeBatchImport() {
  document.getElementById('batch-modal').classList.add('hidden');
}

async function submitBatchImport() {
  const text = document.getElementById('batch-textarea').value.trim();
  if (!text) return alert('請輸入學生資料');

  const lines = text.split('\n').filter(l => l.trim());
  const students = [];
  const parseErrors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const parts = line.split(/[,，\t]+/).map(s => s.trim());
    const seatNum = parseInt(parts[0]);
    const name = parts[1];
    if (!isNaN(seatNum) && name) {
      students.push({ seat_num: seatNum, name });
    } else {
      parseErrors.push(`第 ${i + 1} 行格式錯誤: ${line}`);
    }
  }

  if (students.length === 0) {
    return alert('沒有可匯入的有效資料，格式應為：座號,姓名');
  }

  if (!confirm(`將匯入 ${students.length} 位學生${parseErrors.length ? `（${parseErrors.length} 行格式錯誤將略過）` : ''}，確定嗎？`)) return;

  try {
    const result = await fetchAPI(`/api/classes/${currentClassId}/students/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students })
    });

    let msg = `✅ 成功匯入 ${result.imported} 位學生`;
    if (result.errors && result.errors.length > 0) {
      msg += `<br>⚠️ 以下座號已存在，略過：${result.errors.join('、')}`;
    }
    if (parseErrors.length > 0) {
      msg += `<br>⚠️ 格式錯誤略過：${parseErrors.join('；')}`;
    }

    const resultDiv = document.getElementById('batch-result');
    resultDiv.innerHTML = msg;
    resultDiv.className = 'mt-3 text-sm p-3 rounded-xl ' + (result.errors.length > 0 || parseErrors.length > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700');
    resultDiv.classList.remove('hidden');

    await loadStudents();
    renderRosterList();
  } catch (err) {
    alert('匯入失敗：' + err.message);
  }
}

// --- Auth ---
async function checkAuth() {
  try {
    const data = await fetchAPI('/api/me');
    teacher = data;
    document.getElementById('teacher-name-display').textContent = data.display_name;
    return true;
  } catch (err) {
    window.location.href = '/login';
    return false;
  }
}

async function handleLogout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
}

// --- Application Init ---
async function init() {
  setMarkMode('present');
  renderMonthTabs();
  await loadClasses();
}

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await checkAuth();
  if (ok) await init();
});

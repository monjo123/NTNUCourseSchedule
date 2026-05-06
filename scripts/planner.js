const STORAGE_KEY = "ntnu-course-plan-v1";
const COURSE_SOURCES = ["./public/courses.non-empty.json", "./public/courses.json"];
const DEFAULT_SEMESTER = localStorage.getItem('ntnu-course-semester') || '114_2';
const DAYS = ["一", "二", "三", "四", "五", "六", "日"];
const DAY_LABELS = {
    一: "星期一",
    二: "星期二",
    三: "星期三",
    四: "星期四",
    五: "星期五",
    六: "星期六",
    日: "星期日",
    天: "星期日"
};
const SECTION_ORDER = {
    A: 11,
    B: 12,
    C: 13,
    D: 14,
    E: 15,
    F: 16,
    G: 17,
    H: 18,
    I: 19,
    J: 20
};
const SECTION_ORDER_REVERSE = Object.fromEntries(
    Object.entries(SECTION_ORDER).map(([label, order]) => [order, label])
);

const state = {
    courses: [],
    semester: DEFAULT_SEMESTER,
    selectedIds: new Set(loadSelection(DEFAULT_SEMESTER)),
    selectedSlots: new Set(),
    query: "",
    dept: "ALL",
    kind: "ALL",
    sort: "name",
    visibleCount: 48,
    activeView: localStorage.getItem("ntnu-course-plan-view") || "catalog"
};

const elements = {
    catalogTab: document.getElementById("catalogTab"),
    plannerTab: document.getElementById("plannerTab"),
    catalogView: document.getElementById("catalogView"),
    plannerView: document.getElementById("plannerView"),
    summaryGrid: document.getElementById("summaryGrid"),
    activeFilters: document.getElementById("activeFilters"),
    searchInput: document.getElementById("searchInput"),
    deptSelect: document.getElementById("deptSelect"),
    semesterSelect: document.getElementById("semesterSelect"),
    sortSelect: document.getElementById("sortSelect"),
    resultsLabel: document.getElementById("resultsLabel"),
    courseCountChip: document.getElementById("courseCountChip"),
    visibleCountChip: document.getElementById("visibleCountChip"),
    results: document.getElementById("results"),
    loadMoreBtn: document.getElementById("loadMoreBtn"),
    resetBtn: document.getElementById("resetBtn"),
    clearBtn: document.getElementById("clearBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    plannerSummary: document.getElementById("plannerSummary"),
    selectedList: document.getElementById("selectedList"),
    scheduleBoard: document.getElementById("scheduleBoard"),
    scheduleHint: document.getElementById("scheduleHint"),
    courseDetailModal: document.getElementById("courseDetailModal"),
    modalCourseName: document.getElementById("modalCourseName"),
    modalCourseCode: document.getElementById("modalCourseCode"),
    modalTeacher: document.getElementById("modalTeacher"),
    modalTime: document.getElementById("modalTime"),
    modalRoom: document.getElementById("modalRoom"),
    modalCredit: document.getElementById("modalCredit"),
    modalSeat: document.getElementById("modalSeat"),
    modalComment: document.getElementById("modalComment"),
    modalCommentRow: document.getElementById("modalCommentRow"),
    modalRemoveBtn: document.getElementById("modalRemoveBtn"),
    modalDoneBtn: document.getElementById("modalDoneBtn"),
    modalCloseBtn: document.getElementById("modalCloseBtn")
};

document.documentElement.lang = "zh-Hant";

init().catch((error) => {
    elements.resultsLabel.textContent = "載入失敗";
    elements.results.innerHTML = `<div class="error">無法載入課程資料：${escapeHtml(error.message)}</div>`;
});

async function init() {
    wireEvents();
    renderStaticControls();
    syncView();
    await loadCourses();
    renderAll();
}

function wireEvents() {
    elements.catalogTab.addEventListener("click", () => setActiveView("catalog"));
    elements.plannerTab.addEventListener("click", () => setActiveView("planner"));

    elements.searchInput.addEventListener("input", () => {
        state.query = elements.searchInput.value.trim().toLowerCase();
        state.visibleCount = 48;
        renderAll();
    });

    elements.deptSelect.addEventListener("change", () => {
        state.dept = elements.deptSelect.value;
        state.visibleCount = 48;
        renderAll();
    });


    elements.sortSelect.addEventListener("change", () => {
        state.sort = elements.sortSelect.value;
        renderAll();
    });

    elements.loadMoreBtn.addEventListener("click", () => {
        state.visibleCount += 48;
        renderResults();
    });

    elements.resetBtn.addEventListener("click", () => {
        state.query = "";
        state.dept = "ALL";
        state.kind = "ALL";
        state.sort = "name";
        state.visibleCount = 48;
        elements.searchInput.value = "";
        elements.deptSelect.value = "ALL";
        elements.sortSelect.value = "name";
        renderAll();
    });

    elements.semesterSelect.addEventListener('change', async (e) => {
        const val = e.target.value;
        if (!val || val === state.semester) return;
        if (!confirm('切換學期會清空目前的規劃，是否要繼續？')) {
            elements.semesterSelect.value = state.semester;
            return;
        }
        // Clear selection for current semester
        state.selectedIds.clear();
        saveSelection();
        // Update semester and persist
        state.semester = val;
        localStorage.setItem('ntnu-course-semester', state.semester);
        // Clear selected slots
        state.selectedSlots.clear();
        // Load courses for new semester and render
        try {
            await loadCourses();
            renderAll();
            alert(`已切換至學期 ${state.semester.replace('_', '-')}，目前規劃已清空。`);
        } catch (err) {
            alert('無法載入該學期的課程資料：' + err.message);
        }
    });

    elements.clearBtn.addEventListener("click", () => {
        state.selectedIds.clear();
        saveSelection();
        renderAll();
    });

    elements.exportBtn.addEventListener("click", () => {
        const selected = getSelectedCourses();
        exportScheduleTable();
    });

    elements.importBtn.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".csv";
        input.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                importScheduleTable(file);
            }
        });
        input.click();
    });

    // Modal event listeners
    elements.modalCloseBtn.addEventListener("click", closeCourseDetail);
    elements.modalDoneBtn.addEventListener("click", closeCourseDetail);

    elements.modalRemoveBtn.addEventListener("click", () => {
        const course = elements.courseDetailModal.__currentCourse;
        if (course) {
            toggleCourse(course.serial_no);
            closeCourseDetail();
        }
    });

    elements.courseDetailModal.addEventListener("click", (e) => {
        if (e.target === elements.courseDetailModal) {
            closeCourseDetail();
        }
    });

    // Hide selectedList and plannerSummary
    if (elements.selectedList) {
        elements.selectedList.style.display = "none";
    }

    // Ensure modal is initially closed
    if (elements.courseDetailModal) {
        elements.courseDetailModal.classList.remove("open");
    }

    // Initialize slot picker UI
    try {
        const picker = document.getElementById('slotPicker');
        const pickerContainer = document.getElementById('slotPickerContainer');
        if (picker) {
            const FULL_SECTIONS = [...Array.from({ length: 10 }, (_, i) => String(i + 1)), 'A', 'B', 'C'];
            // Build header row with day checkboxes
            let html = '';
            html += `<div style="display:flex; align-items:center; justify-content:center; font-weight:600;">節次\\星期</div>`;
            for (const day of DAYS) {
                html += `<div style="text-align:center;"><label style="display:flex;flex-direction:column;align-items:center;gap:4px;"><input class=\"day-checkbox\" type=\"checkbox\" data-day=\"${day}\" id=\"day-${day}\"><span style=\"font-weight:600;\">${DAY_LABELS[day] || day}</span></label></div>`;
            }

            // Build rows for each section
            for (const section of FULL_SECTIONS) {
                html += `<div style="display:flex; align-items:center; justify-content:center; font-weight:600;">${escapeHtml(section)}</div>`;
                for (const day of DAYS) {
                    html += `<div style="text-align:center;"><input class=\"slot-checkbox\" type=\"checkbox\" data-day=\"${day}\" data-section=\"${section}\" id=\"slot-${day}-${section}\"></div>`;
                }
            }

            picker.innerHTML = html;

            // Delegate change handling for both slot and day checkboxes
            picker.addEventListener('change', (e) => {
                const target = e.target;
                if (!target) return;

                // Day checkbox toggles entire column
                if (target.classList && target.classList.contains('day-checkbox')) {
                    const day = target.dataset.day;
                    const checked = !!target.checked;
                    picker.querySelectorAll(`.slot-checkbox[data-day="${day}"]`).forEach(cb => {
                        cb.checked = checked;
                        const key = `${day}-${cb.dataset.section}`;
                        if (checked) state.selectedSlots.add(key);
                        else state.selectedSlots.delete(key);
                    });
                    renderResults();
                    return;
                }

                // Individual slot checkbox
                if (target.classList && target.classList.contains('slot-checkbox')) {
                    const day = target.dataset.day;
                    const section = target.dataset.section;
                    const key = `${day}-${section}`;
                    if (target.checked) state.selectedSlots.add(key);
                    else state.selectedSlots.delete(key);

                    // Update day header state (checked / indeterminate)
                    const dayCb = picker.querySelector(`.day-checkbox[data-day="${day}"]`);
                    if (dayCb) {
                        const total = picker.querySelectorAll(`.slot-checkbox[data-day="${day}"]`).length;
                        const checkedCount = picker.querySelectorAll(`.slot-checkbox[data-day="${day}"]:checked`).length;
                        dayCb.checked = checkedCount === total;
                        dayCb.indeterminate = checkedCount > 0 && checkedCount < total;
                    }

                    renderResults();
                }
            });

            const clearBtn = document.getElementById('clearSlotSelection');
            if (clearBtn) clearBtn.addEventListener('click', () => {
                state.selectedSlots.clear();
                picker.querySelectorAll('.slot-checkbox, .day-checkbox').forEach(cb => { cb.checked = false; cb.indeterminate = false; });
                renderResults();
            });

            const invertBtn = document.getElementById('invertSlotSelection');
            if (invertBtn) invertBtn.addEventListener('click', () => {
                // Invert per-slot selection
                picker.querySelectorAll('.slot-checkbox').forEach(cb => {
                    const day = cb.dataset.day;
                    const section = cb.dataset.section;
                    const key = `${day}-${section}`;
                    cb.checked = !cb.checked;
                    if (cb.checked) state.selectedSlots.add(key);
                    else state.selectedSlots.delete(key);
                });
                // Update day headers
                picker.querySelectorAll('.day-checkbox').forEach(dayCb => {
                    const day = dayCb.dataset.day;
                    const total = picker.querySelectorAll(`.slot-checkbox[data-day="${day}"]`).length;
                    const checkedCount = picker.querySelectorAll(`.slot-checkbox[data-day="${day}"]:checked`).length;
                    dayCb.checked = checkedCount === total;
                    dayCb.indeterminate = checkedCount > 0 && checkedCount < total;
                });
                renderResults();
            });

            // Toggle collapse/expand slot picker
            // 1. 取得按鈕與文字標籤元素[cite: 1, 2]
            const toggleBtn = document.getElementById('toggleSlotPicker');
            const pickerContainer = document.getElementById('slotPickerContainer');
            // 透過選擇器找到「時段勾選」這一行的 label
            const labelText = document.querySelector('label[style*="cursor:pointer"]');

            if (toggleBtn && pickerContainer) {
                let isCollapsed = false;

                // 2. 定義統一的切換功能[cite: 1]
                const toggleAction = () => {
                    isCollapsed = !isCollapsed;
                    if (isCollapsed) {
                        pickerContainer.style.maxHeight = '0';
                        pickerContainer.style.overflow = 'hidden';
                        toggleBtn.textContent = '◀'; // 原程式碼中的圖示修復
                    } else {
                        pickerContainer.style.maxHeight = '500px';
                        toggleBtn.textContent = '▼';
                    }
                };

                // 3. 保留原本按鈕的點擊觸發[cite: 1]
                toggleBtn.addEventListener('click', toggleAction);

                // 4. 新增：文字行「點兩下」觸發切換[cite: 1]
                if (labelText) {
                    // 加上 user-select: none 防止頻繁點擊導致文字被選取（變藍色）
                    labelText.style.userSelect = "none";
                    labelText.addEventListener('dblclick', toggleAction);
                }
            }
        }
    } catch (e) {
        console.warn('slotPicker init failed', e);
    }
}

function renderStaticControls() {

    elements.sortSelect.innerHTML = [
        ["name", "課名"],
        ["time", "時間"],
        ["credit", "學分"],
        ["seat", "名額"],
        ["teacher", "教師"]
    ]
        .map(([value, label]) => `<option value="${value}">${label}</option>`)
        .join("");

    // Set semester select to current state
    try {
        if (elements.semesterSelect) elements.semesterSelect.value = state.semester;
    } catch (e) { }
}

async function loadCourses() {
    let lastError = null;

    // Build semester-specific sources first
    const [year, term] = (state.semester || DEFAULT_SEMESTER).split("_");
    const semPrefix = `./public/${year}_${term}`;
    const sources = [
        `${semPrefix}/courses.non-empty.json`,
        `${semPrefix}/courses.json`,
        ...COURSE_SOURCES
    ];

    for (const source of sources) {
        try {
            const response = await fetch(source, { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            state.courses = data.map(normalizeCourse);
            populateFilters();
            return;
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error("未知錯誤");
}

function populateFilters() {
    const depts = [...new Set(state.courses.map((course) => course.dept_chiabbr || course.dept_code || "未分類"))]
        .sort((left, right) => left.localeCompare(right, "zh-Hant"));
    const kinds = [...new Set(state.courses.map((course) => course.course_kind || "未分類"))]
        .sort((left, right) => left.localeCompare(right, "zh-Hant"));

    elements.deptSelect.innerHTML = [
        `<option value="ALL">全部系所/分類</option>`,
        ...depts.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    ].join("");

}

function renderAll() {
    syncView();
    renderSummary();
    renderPlanner();
    renderResults();
}

function setActiveView(viewName) {
    state.activeView = viewName;
    localStorage.setItem("ntnu-course-plan-view", viewName);
    syncView();
}

function syncView() {
    const plannerMode = state.activeView === "planner";
    elements.catalogTab.setAttribute("aria-selected", String(!plannerMode));
    elements.plannerTab.setAttribute("aria-selected", String(plannerMode));
    elements.catalogView.hidden = plannerMode;
    elements.plannerView.hidden = !plannerMode;
}

function renderSummary() {
    const selected = getSelectedCourses();
    const totalCredits = selected.reduce((sum, course) => sum + course.creditValue, 0);
    const conflicts = getConflictSet(selected);

    elements.summaryGrid.innerHTML = [
        {
            label: "課程總數",
            value: state.courses.length,
            note: "已整理並去除空欄位的資料"
        },
        {
            label: "已選課程",
            value: selected.length,
            note: "目前規劃中的課程數量"
        },
        {
            label: "總學分",
            value: totalCredits.toFixed(1),
            note: "依已選課程 credit 加總"
        },
        {
            label: "衝突課程",
            value: conflicts.size,
            note: conflicts.size ? "有重疊時段，請再檢查" : "目前沒有時間衝突"
        }
    ]
        .map(({ label, value, note }) => `
      <div class="summary-card">
        <span class="label">${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(value))}</strong>
        <small>${escapeHtml(note)}</small>
      </div>
    `)
        .join("");

    const chips = [];
    if (state.query) chips.push(`搜尋：${escapeHtml(state.query)}`);
    if (state.dept !== "ALL") chips.push(`分類：${escapeHtml(state.dept)}`);
    if (state.kind !== "ALL") chips.push(`類型：${escapeHtml(state.kind)}`);
    if (state.sort !== "name") {
        chips.push(`排序：${escapeHtml(elements.sortSelect.options[elements.sortSelect.selectedIndex].text)}`);
    }

    elements.activeFilters.innerHTML = chips.length
        ? chips.map((value) => `<span class="chip">${value}</span>`).join("")
        : `<span class="chip soft">目前未套用篩選</span>`;

    if (selected.length === 0) {
        elements.plannerSummary.innerHTML = `<span class="chip soft">尚未加入課程</span>`;
    } else {
        elements.plannerSummary.innerHTML = [
            `<span class="chip">${selected.length} 門已選</span>`,
            `<span class="chip">${totalCredits.toFixed(1)} 學分</span>`,
            conflicts.size ? `<span class="chip warn">${conflicts.size} 門衝突</span>` : `<span class="chip">無衝突</span>`
        ].join("");
    }
}

function renderResults() {
    const filtered = getFilteredCourses();
    const visible = filtered.slice(0, state.visibleCount);
    const selectedIds = state.selectedIds;
    const conflictSet = getConflictSet(getSelectedCourses());

    elements.resultsLabel.textContent = filtered.length ? `找到 ${filtered.length} 門課程` : "沒有符合條件的課程";
    elements.courseCountChip.textContent = `${state.courses.length} 門課程`;
    elements.visibleCountChip.textContent = `${visible.length}/${filtered.length || 0} 筆顯示`;
    elements.loadMoreBtn.disabled = visible.length >= filtered.length;

    if (visible.length === 0) {
        elements.results.innerHTML = `
      <div class="empty-state">
        目前沒有符合條件的課程。可以試著放寬搜尋字詞、切換系所，或按「重設篩選」恢復預設。
      </div>
    `;
        return;
    }

    elements.results.innerHTML = visible.map((course) => {
        const isSelected = selectedIds.has(course.serial_no);
        const hasConflict = conflictSet.has(course.serial_no);
        const highlightTags = [
            course.dept_chiabbr || course.dept_code,
            course.course_kind,
            course.course_group ? `組別 ${course.course_group}` : null,
            `學分 ${course.creditValue.toFixed(1)}`
        ].filter(Boolean);

        return `
      <article class="course-card" data-id="${escapeHtml(course.serial_no)}">
        <div class="course-top">
          <div class="course-title">
            <div class="chips">
              <span class="chip">${escapeHtml(course.course_code || "")}</span>
              ${highlightTags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}
              ${hasConflict ? `<span class="chip warn">衝突</span>` : ""}
            </div>
            <h3>${escapeHtml(course.chn_name || course.eng_name || "未命名課程")}</h3>
            <p>${escapeHtml(course.eng_name || "")}</p>
          </div>
          <button class="btn ${isSelected ? "danger" : "primary"}" type="button" data-action="toggle" data-id="${escapeHtml(course.serial_no)}">
            ${isSelected ? "移除" : "加入規劃"}
          </button>
        </div>

        <div class="meta-grid">
          <span class="meta">${escapeHtml(course.teacher || "未指定")}</span>
          <span class="meta">${escapeHtml(formatTimeLabel(course))}</span>
          <span class="meta">${escapeHtml(getRoomText(course))}</span>
          <span class="meta">名額 ${escapeHtml(seatText(course))}</span>
          ${course.comment ? `<span class="meta">備註：${escapeHtml(course.comment)}</span>` : ""}
        </div>

        <div class="course-actions">
          <div class="muted">流水號 ${escapeHtml(course.serial_no || "-")}</div>
          <div class="chips">
            ${hasConflict ? `<span class="chip warn">與已選課程時間重疊</span>` : `<span class="chip soft">可加入規劃</span>`}
          </div>
        </div>
      </article>
    `;
    }).join("");

    elements.results.querySelectorAll("[data-action='toggle']").forEach((button) => {
        button.addEventListener("click", () => toggleCourse(button.dataset.id));
    });
}

function renderPlanner() {
    const selected = getSelectedCourses();
    const conflictSet = getConflictSet(selected);

    if (selected.length === 0) {
        elements.selectedList.innerHTML = `
      <div class="empty-state">
        右側目前是空的。從左邊搜尋課程後按「加入規劃」，就會在這裡看到學分總覽、選課清單與週課表。
      </div>
    `;
        elements.scheduleHint.textContent = "尚未加入課程";
    } else {
        elements.selectedList.innerHTML = selected.map((course) => {
            const conflict = conflictSet.has(course.serial_no);
            return `
        <article class="selected-card">
          <header>
            <div class="course-title">
              <div class="chips">
                <span class="chip">${escapeHtml(course.course_code || "")}</span>
                <span class="chip">${escapeHtml(course.course_kind || "")}</span>
                ${course.course_group ? `<span class="chip">組別 ${escapeHtml(course.course_group)}</span>` : ""}
                ${conflict ? `<span class="chip warn">衝突</span>` : `<span class="chip">正常</span>`}
              </div>
              <h3>${escapeHtml(course.chn_name || course.eng_name || "未命名課程")}</h3>
              <p>${escapeHtml(course.teacher || "未指定教師")} · ${escapeHtml(formatTimeLabel(course))} · ${escapeHtml(getRoomText(course))}</p>
            </div>
            <button class="btn danger" type="button" data-action="remove" data-id="${escapeHtml(course.serial_no)}">移除</button>
          </header>
          <div class="meta-grid">
            <span class="meta">學分 ${escapeHtml(formatCredit(course.creditValue))}</span>
            <span class="meta">名額 ${escapeHtml(seatText(course))}</span>
            <span class="meta">時間 ${escapeHtml(formatTimeLabel(course))}</span>
            <span class="meta">教室 ${escapeHtml(getRoomText(course))}</span>
            <span class="meta">流水號 ${escapeHtml(course.serial_no || "-")}</span>
          </div>
        </article>
      `;
        }).join("");

        elements.selectedList.querySelectorAll("[data-action='remove']").forEach((button) => {
            button.addEventListener("click", () => toggleCourse(button.dataset.id));
        });

        elements.scheduleHint.textContent = `${selected.length} 門課程已加入規劃`;
    }

    // Render schedule as rows per section (1-10, A, B, C) for each day
    const FULL_SECTIONS = [...Array.from({ length: 10 }, (_, i) => String(i + 1)), 'A', 'B', 'C'];

    // build map day -> section -> [courses]
    const daySectionMap = new Map(DAYS.map((d) => [d, new Map(FULL_SECTIONS.map((s) => [s, []]))]));

    for (const course of selected) {
        const slots = parseSlots(getScheduleTime(course));
        for (const slot of slots) {
            if (!daySectionMap.has(slot.day)) continue;
            const sectionKey = sectionFromOrder(slot.order ?? sectionToOrder(slot.section));
            const sectionList = daySectionMap.get(slot.day).get(sectionKey) || [];
            sectionList.push({
                course,
                title: shortTitle(course),
                color: colorForCourse(course.serial_no),
                time: formatTimeLabel(course)
            });
            daySectionMap.get(slot.day).set(sectionKey, sectionList);
        }
    }

    // render as table: header row + body rows
    const headerRow = `<div class="schedule-header-row">
    <div class="schedule-cell-label">節次</div>
    ${DAYS.map(day => `<div class="schedule-cell-header">${DAY_LABELS[day]}</div>`).join('')}
  </div>`;

    const bodyRows = FULL_SECTIONS.map(sec => {
        const cells = DAYS.map(day => {
            const arr = daySectionMap.get(day).get(sec) || [];
            return `<div class="schedule-cell">
        ${arr.length ? arr.map(item => {
                const isConflict = conflictSet.has(item.course.serial_no);

                        return `
        <div class="schedule-item"
            data-serial-no="${escapeHtml(item.course.serial_no)}"
            style="
                border-color: ${isConflict ? '#b42318' : item.color}33;
                background: ${isConflict ? 'rgba(180,35,24,0.15)' : item.color + '14'};
                cursor: pointer;
            ">
            <strong>${escapeHtml(item.title)}</strong>
        </div>
    `;
            }).join('') : ''}
      </div>`;
        }).join('');
        return `<div class="schedule-body-row">
      <div class="schedule-cell-label">${escapeHtml(sec)}</div>
      ${cells}
    </div>`;
    }).join('');

    elements.scheduleBoard.innerHTML = `<div class="schedule-table">${headerRow}${bodyRows}</div>`;

    // Add click handlers to schedule items
    elements.scheduleBoard.querySelectorAll(".schedule-item").forEach((item) => {
        item.addEventListener("click", () => {
            const serialNo = item.dataset.serialNo;
            const course = state.courses.find(c => c.serial_no == serialNo);
            if (course) showCourseDetail(course);
        });
    });
}

function getFilteredCourses() {
    return state.courses
        .filter((course) => {
            if (state.dept !== "ALL" && (course.dept_chiabbr || course.dept_code || "未分類") !== state.dept) {
                return false;
            }

            if (state.kind !== "ALL" && (course.course_kind || "未分類") !== state.kind) {
                return false;
            }

            // If slot selection is active, ensure course times are fully within selected slots
            if (state.selectedSlots && state.selectedSlots.size > 0) {
                const slots = parseSlots(getScheduleTime(course));
                if (!slots || slots.length === 0) return false;
                for (const slot of slots) {
                    const sectionKey = sectionFromOrder(slot.order ?? sectionToOrder(slot.section));
                    const key = `${slot.day}-${sectionKey}`;
                    if (!state.selectedSlots.has(key)) {
                        return false;
                    }
                }
            }

            if (!state.query) {
                return true;
            }

            return course.searchText.includes(state.query);
        })
        .sort(compareCourses(state.sort));
}

function compareCourses(sortMode) {
    return (left, right) => {
        if (sortMode === "credit") {
            return right.creditValue - left.creditValue || compareText(left.chn_name, right.chn_name) || compareText(left.serial_no, right.serial_no);
        }

        if (sortMode === "time") {
            return firstSlotSortKey(left) - firstSlotSortKey(right) || compareText(left.chn_name, right.chn_name) || compareText(left.serial_no, right.serial_no);
        }

        if (sortMode === "seat") {
            return seatAvailability(right) - seatAvailability(left) || compareText(left.chn_name, right.chn_name) || compareText(left.serial_no, right.serial_no);
        }

        if (sortMode === "teacher") {
            return compareText(left.teacher, right.teacher) || compareText(left.chn_name, right.chn_name) || compareText(left.serial_no, right.serial_no);
        }

        return compareText(left.chn_name, right.chn_name) || compareText(left.eng_name, right.eng_name) || compareText(left.serial_no, right.serial_no);
    };
}

function showCourseDetail(course) {
    if (!course) return;

    elements.modalCourseName.textContent = course.chn_name || "-";
    elements.modalCourseCode.textContent = course.course_code || "-";
    elements.modalTeacher.textContent = course.teacher || "-";
    elements.modalTime.textContent = formatTimeInfo(getScheduleTime(course));
    elements.modalRoom.textContent = extractRoom(getScheduleTime(course)) || "-";
    elements.modalCredit.textContent = course.credit || "-";
    elements.modalSeat.textContent = `${course.counter || 0}/${course.limit_count_h || 0}`;

    if (course.comment) {
        elements.modalComment.textContent = course.comment;
        elements.modalCommentRow.style.display = "";
    } else {
        elements.modalCommentRow.style.display = "none";
    }

    // Store current course for remove action
    elements.courseDetailModal.__currentCourse = course;

    // Show modal using CSS class and let CSS handle animation
    elements.courseDetailModal.classList.add("open");
}

function closeCourseDetail() {
    elements.courseDetailModal.classList.remove("open");
    elements.courseDetailModal.__currentCourse = null;
}

function toggleCourse(serialNo) {
    if (!serialNo) {
        return;
    }

    if (state.selectedIds.has(serialNo)) {
        state.selectedIds.delete(serialNo);
    } else {
        state.selectedIds.add(serialNo);
    }

    saveSelection();
    renderAll();
}

function getSelectedCourses() {
    const courseMap = new Map(state.courses.map((course) => [course.serial_no, course]));
    return [...state.selectedIds].map((serialNo) => courseMap.get(serialNo)).filter(Boolean);
}

function getConflictSet(courses) {
    const occupied = new Map();
    const conflicts = new Set();

    for (const course of courses) {
        for (const slot of parseSlots(getScheduleTime(course))) {
            const key = `${slot.day}:${slot.order ?? slot.section}`;
            const previous = occupied.get(key);

            if (previous && previous !== course.serial_no) {
                conflicts.add(previous);
                conflicts.add(course.serial_no);
            } else {
                occupied.set(key, course.serial_no);
            }
        }
    }

    return conflicts;
}

function buildScheduleByDay(courses) {
    const schedule = new Map(DAYS.map((day) => [day, []]));

    for (const course of courses) {
        const color = colorForCourse(course.serial_no);
        const slots = parseSlots(getScheduleTime(course));

        if (slots.length === 0) {
            schedule.get("一").push({
                color,
                title: shortTitle(course),
                time: formatTimeLabel(course),
                room: getRoomText(course),
                section: "未提供節次"
            });
            continue;
        }

        for (const slot of slots) {
            if (!schedule.has(slot.day)) {
                continue;
            }

            schedule.get(slot.day).push({
                color,
                title: shortTitle(course),
                time: formatTimeLabel(course),
                room: getRoomText(course),
                section: slot.sectionLabel
            });
        }
    }

    for (const day of DAYS) {
        schedule.get(day).sort((left, right) => left.section.localeCompare(right.section, "en", { numeric: true }));
    }

    return schedule;
}

function parseSlots(timeText) {
    if (!timeText) {
        return [];
    }

    const tokens = String(timeText).trim().split(/\s+/);
    const slots = [];

    for (let index = 0; index < tokens.length; index += 1) {
        const day = normalizeDay(tokens[index]);
        if (!day) {
            continue;
        }

        const sectionToken = tokens[index + 1];
        if (!sectionToken) {
            continue;
        }

        for (const section of expandSections(sectionToken)) {
            slots.push({
                day,
                section,
                order: sectionToOrder(section),
                sectionLabel: formatSlotLabel(day, section)
            });
        }
    }

    return slots;
}

function formatSlotLabel(day, section) {
    // day: '一'..'日', section: e.g. '7', '8-9', 'A'
    if (!day || !section) return '';

    const single = /^\d+$/.test(section);
    if (single) {
        return `禮拜${day}第${section}節`;
    }

    return `禮拜${day}${section}節`;
}

function extractRoom(timeText) {
    if (!timeText) return "";

    const segments = String(timeText).trim().split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const rooms = [];
    const dayRegex = /^(?:星期|週|周)?(?:[一二三四五六日天])$/;

    for (const seg of segments) {
        const tokens = seg.split(/\s+/).filter(Boolean);
        let foundRoom = "";

        for (let i = 0; i < tokens.length - 1; i++) {
            if (dayRegex.test(tokens[i])) {
                // tokens[i] is Day, tokens[i+1] is Section, remaining is Room
                const roomTokens = tokens.slice(i + 2);
                if (roomTokens.length > 0) {
                    foundRoom = roomTokens.join(" ");
                    break;
                }
            }
        }

        if (foundRoom && !rooms.includes(foundRoom)) {
            rooms.push(foundRoom);
        }
    }

    if (rooms.length === 0) return "";
    if (rooms.length === 1) return rooms[0];
    return rooms.join(" 與 ");
}

function formatTimeInfo(timeText) {
    if (!timeText) {
        return "未提供時間";
    }

    const tokens = String(timeText).trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 2) {
        return String(timeText).trim();
    }

    const room = tokens.slice(2).join(" ");
    const summary = summarizeSlots(String(timeText));
    const roomLabel = room ? ` 教室 : ${room}` : "";
    return `${summary}${roomLabel}`;
}

function formatTimeLabel(course) {
    const timeText = getScheduleTime(course);
    if (!timeText) return "未提供時間";
    return summarizeSlots(String(timeText));
}

function summarizeSlots(timeText) {
    // parse into slots, group by day, compress contiguous numeric sections into ranges
    const slots = parseSlots(timeText);
    if (!slots || slots.length === 0) return String(timeText).trim();

    const byDay = new Map();
    for (const s of slots) {
        const arr = byDay.get(s.day) || [];
        arr.push(s);
        byDay.set(s.day, arr);
    }

    // Helper to convert 11-13 to A-C
    const convertSectionNumber = (num) => {
        if (num === 11) return 'A';
        if (num === 12) return 'B';
        if (num === 13) return 'C';
        return num;
    };

    const parts = [];
    for (const day of DAYS) {
        const items = byDay.get(day);
        if (!items || items.length === 0) continue;

        // collect numeric orders or keep letter labels
        const orders = items.map((it) => Number.isFinite(it.order) ? it.order : it.section).filter(Boolean);
        const numeric = orders.every((v) => typeof v === 'number');

        if (numeric) {
            const uniq = Array.from(new Set(orders)).sort((a, b) => a - b);
            // compress contiguous ranges
            const ranges = [];
            let start = uniq[0], end = uniq[0];
            for (let i = 1; i < uniq.length; i++) {
                const cur = uniq[i];
                if (cur === end + 1) {
                    end = cur;
                } else {
                    ranges.push([start, end]);
                    start = cur; end = cur;
                }
            }
            ranges.push([start, end]);

            const segs = ranges.map(([a, b]) => {
                const startLabel = convertSectionNumber(a);
                const endLabel = convertSectionNumber(b);
                if (startLabel === endLabel) {
                    return String(startLabel);
                }
                return `${startLabel}-${endLabel}`;
            });
            const label = segs.length === 1 && segs[0].match(/^[0-9]+$/) ? `禮拜${day}第${segs[0]}節` : `禮拜${day}${segs.join(',')}節`;
            parts.push(label);
        } else {
            // non-numeric (letters), show each
            const labels = items.map(it => formatSlotLabel(it.day, it.section));
            parts.push(...labels);
        }
    }

    if (parts.length === 0) return String(timeText).trim();
    if (parts.length === 1) return parts[0];
    // join with commas and '與' before last
    if (parts.length === 2) return `${parts[0]} 與 ${parts[1]}`;
    return parts.slice(0, -1).join('、') + ' 與 ' + parts[parts.length - 1];
}

function expandSections(sectionToken) {
    return String(sectionToken)
        .split(/[、,，+\/+&]/)
        .flatMap((part) => {
            let token = part.trim();
            if (!token) return [];

            // remove trailing '節' or '節次' and dots
            token = token.replace(/[節次\.]+$/g, "");

            if (!token.includes("-")) {
                // handle lists like "7,8,9" by further splitting
                return token.split(/[,、，]/).map((t) => t.trim()).filter(Boolean);
            }

            const [start, end] = token.split("-").map((value) => value.trim());
            const startOrder = sectionToOrder(start);
            const endOrder = sectionToOrder(end);

            if (Number.isFinite(startOrder) && Number.isFinite(endOrder)) {
                const from = Math.min(startOrder, endOrder);
                const to = Math.max(startOrder, endOrder);
                return Array.from({ length: to - from + 1 }, (_, offset) => sectionFromOrder(from + offset));
            }

            return [start, end].filter(Boolean);
        });
}

function normalizeDay(day) {
    if (!day) return null;
    const s = String(day).trim();
    if (s === "天") return "日";

    // accept forms like "星期五", "週五", "周五" and single-char like "五"
    const m = s.match(/(?:星期|週|周)?([一二三四五六日天])/);
    if (m) return m[1] === "天" ? "日" : m[1];

    return Object.prototype.hasOwnProperty.call(DAY_LABELS, s) ? s : null;
}

function sectionToOrder(section) {
    const value = String(section).trim().toUpperCase();
    if (/^\d+$/.test(value)) {
        return Number(value);
    }

    return SECTION_ORDER[value] || Number.POSITIVE_INFINITY;
}

function sectionFromOrder(order) {
    if (order <= 10) {
        return String(order);
    }

    return SECTION_ORDER_REVERSE[order] || String(order);
}

function firstSlotSortKey(course) {
    const slots = parseSlots(getScheduleTime(course));
    if (slots.length === 0) {
        return Number.POSITIVE_INFINITY;
    }

    const first = slots[0];
    return DAYS.indexOf(first.day) * 100 + (Number.isFinite(first.order) ? first.order : 99);
}

function seatAvailability(course) {
    return Math.max(0, (course.limitCount || 0) - (course.counter || 0));
}

function seatText(course) {
    const limit = course.limitCount || 0;
    const current = course.counter || 0;

    if (!limit && !current) {
        return "未提供";
    }

    return `${current}/${limit || current}`;
}

function shortTitle(course) {
    return course.chn_name || course.eng_name || course.course_code || course.serial_no;
}

function formatCredit(value) {
    return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function compareText(left, right) {
    return String(left || "").localeCompare(String(right || ""), "zh-Hant", {
        numeric: true,
        sensitivity: "base"
    });
}

function normalizeCourse(course) {
    const scheduleTime = getScheduleTime(course);
    return {
        ...course,
        creditValue: Number.parseFloat(course.credit) || 0,
        counter: Number.parseInt(course.counter || "0", 10) || 0,
        limitCount: Number.parseInt(course.limit_count_h || course.limit || course.counter || "0", 10) || 0,
        scheduleTime,
        roomText: getRoomText(course),
        searchText: [
            course.chn_name,
            course.eng_name,
            course.teacher,
            course.course_code,
            scheduleTime,
            getRoomText(course),
            course.comment,
            course.dept_chiabbr,
            course.dept_code,
            course.course_group,
            course.serial_no
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
    };
}

function colorForCourse(serialNo) {
    const hash = [...String(serialNo || "")].reduce(
        (accumulator, char) => (accumulator * 31 + char.charCodeAt(0)) % 360,
        120
    );
    return `hsl(${hash} 45% 42%)`;
}

function getScheduleTime(course) {
    return String(course?.time || course?.time_inf || "").trim();
}

function getRoomText(course) {
    if (course?.room) {
        return String(course.room).trim() || "未提供教室";
    }

    const raw = String(course?.time_inf || "").trim();
    if (!raw) {
        return "未提供教室";
    }

    const extracted = extractRoom(raw);
    return extracted || "未提供教室";
}

function saveSelection() {
    const key = `${STORAGE_KEY}-${state.semester}`;
    localStorage.setItem(key, JSON.stringify([...state.selectedIds]));
}

function loadSelection(semester) {
    try {
        const key = `${STORAGE_KEY}-${semester || DEFAULT_SEMESTER}`;
        const parsed = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
        return [];
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function exportScheduleTable() {
    const selected = getSelectedCourses();
    if (selected.length === 0) {
        alert("尚未加入課程，無法匯出");
        return;
    }

    // Build schedule map
    const FULL_SECTIONS = [...Array.from({ length: 10 }, (_, i) => String(i + 1)), 'A', 'B', 'C'];
    const daySectionMap = new Map(DAYS.map((d) => [d, new Map(FULL_SECTIONS.map((s) => [s, []]))]));

    for (const course of selected) {
        const slots = parseSlots(getScheduleTime(course));
        for (const slot of slots) {
            if (!daySectionMap.has(slot.day)) continue;
            const sectionKey = sectionFromOrder(slot.order ?? sectionToOrder(slot.section));
            const sectionList = daySectionMap.get(slot.day).get(sectionKey) || [];
            sectionList.push({
                course,
                title: shortTitle(course),
                serialNo: course.serial_no
            });
            daySectionMap.get(slot.day).set(sectionKey, sectionList);
        }
    }

    // Helper function to escape CSV fields
    const escapeCSV = (field) => {
        if (!field) return "";
        const str = String(field);
        // If field contains comma, newline, or quote, wrap in quotes and escape quotes
        if (str.includes(",") || str.includes("\n") || str.includes('"')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    };

    // Build CSV with embedded serialNo data
    const header = ["節次", ...DAYS.map(d => DAY_LABELS[d])].map(escapeCSV).join(",");
    const rows = [header];

    for (const sec of FULL_SECTIONS) {
        const cells = [sec];
        for (const day of DAYS) {
            const arr = daySectionMap.get(day).get(sec) || [];
            // Each cell stores course titles and serial numbers
            const cellText = arr.map((item) => {
                return `${item.title}|${item.serialNo}`;
            }).join("\n");
            cells.push(cellText);
        }
        rows.push(cells.map(escapeCSV).join(","));
    }

    // Prepend semester header
    const semLabel = `${state.semester.replace('_', '-')}`;
    const semRow = [escapeCSV('SEMESTER'), escapeCSV(semLabel)].join(',');
    const csvContent = [semRow, ...rows].join("\n");
    // Add UTF-8 BOM for Excel to correctly recognize encoding
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ntnu-schedule-${semLabel}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
}

function importScheduleTable(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const content = e.target.result;
        // Remove BOM if present
        const cleanContent = content.replace(/^\uFEFF/, "");
        const lines = cleanContent.split("\n");
        if (lines.length < 2) {
            alert("檔案格式不正確");
            return;
        }

        // Helper to parse CSV line (handle quoted fields)
        const parseCSVLine = (line) => {
            const result = [];
            let current = "";
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                const nextChar = line[i + 1];

                if (char === '"') {
                    if (inQuotes && nextChar === '"') {
                        // Escaped quote
                        current += '"';
                        i++; // Skip next quote
                    } else {
                        // Toggle quote mode
                        inQuotes = !inQuotes;
                    }
                } else if (char === "," && !inQuotes) {
                    // Field separator
                    result.push(current);
                    current = "";
                } else {
                    current += char;
                }
            }
            result.push(current);
            return result;
        };

        // Parse the header (may contain semester info)
        const header = parseCSVLine(lines[0]);
        let fileSemester = null;
        // If first cell is SEMESTER, parse and remove that line
        if (Array.isArray(header) && header.length >= 2 && String(header[0]).trim().toUpperCase() === 'SEMESTER') {
            fileSemester = String(header[1] || '').trim().replace(/-/g, '_');
            // If semester mismatch, offer auto-switch
            if (fileSemester && fileSemester !== state.semester) {
                const shouldSwitch = confirm(
                    `匯入檔案屬於學期 ${fileSemester.replace('_', '-')}，目前為 ${state.semester.replace('_', '-')}。\n` +
                    `是否自動切換到該學期並清空目前規劃，然後繼續匯入？`
                );
                if (!shouldSwitch) {
                    alert('已取消匯入');
                    return;
                }
                // Auto-switch semester
                try {
                    state.selectedIds.clear();
                    saveSelection();
                    state.semester = fileSemester;
                    localStorage.setItem('ntnu-course-semester', state.semester);
                    state.selectedSlots.clear();
                    if (elements.semesterSelect) elements.semesterSelect.value = state.semester;
                    await loadCourses();
                    renderAll();
                } catch (err) {
                    alert('無法載入該學期的課程資料：' + (err && err.message ? err.message : err));
                    return;
                }
            }
            // remove semester row from lines
            lines.splice(0, 1);
        }

        const FULL_SECTIONS = [...Array.from({ length: 10 }, (_, i) => String(i + 1)), 'A', 'B', 'C'];

        // Extract all courses with title, serial number, and their occurrence times
        const coursesFromFile = [];
        const courseOccurrences = new Map(); // serial_no -> Set of {day, section}

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue; // Skip empty lines

            const cells = parseCSVLine(line);
            const sectionLabel = cells[0].trim(); // First column is the section (1-10, A, B, C)

            for (let dayIdx = 1; dayIdx < cells.length; dayIdx++) {
                const cell = cells[dayIdx];
                // Each cell may have multiple courses separated by \n
                const courses = cell.split("\n").filter(Boolean);
                for (const course of courses) {
                    // Format is "title|serialNo"
                    const parts = course.split("|");
                    if (parts.length >= 2) {
                        const title = parts[0].trim();
                        const serialNo = parts[parts.length - 1].trim();
                        if (serialNo) {
                            coursesFromFile.push({ title, serialNo });

                            // Record occurrence
                            if (!courseOccurrences.has(serialNo)) {
                                courseOccurrences.set(serialNo, new Set());
                            }
                            const dayIndex = dayIdx - 1; // 0-based index into DAYS array
                            const day = DAYS[dayIndex];
                            if (day) {
                                courseOccurrences.get(serialNo).add(JSON.stringify({ day, section: sectionLabel }));
                            }
                        }
                    }
                }
            }
        }

        if (coursesFromFile.length === 0) {
            alert("檔案中未找到課程資訊");
            return;
        }

        // Validate courses and separate into valid, invalid, and incomplete
        const validSerialNos = new Set();
        const invalidCourses = [];
        const incompleteCourses = [];

        for (const { title, serialNo } of coursesFromFile) {
            // Check if course exists in database
            const course = state.courses.find(c => String(c.serial_no) === String(serialNo));

            if (!course) {
                invalidCourses.push({ title, serialNo });
                continue;
            }

            // Check if all expected time slots are present in the file
            const expectedSlots = parseSlots(getScheduleTime(course));
            const expectedSet = new Set(
                expectedSlots.map(slot => JSON.stringify({ day: slot.day, section: sectionFromOrder(slot.order ?? sectionToOrder(slot.section)) }))
            );

            const actualSet = courseOccurrences.get(serialNo) || new Set();

            // Check if all expected slots are present
            let allSlotsPresentCount = 0;
            for (const expected of expectedSet) {
                if (actualSet.has(expected)) {
                    allSlotsPresentCount++;
                }
            }

            // If not all expected slots are present in the file, it's incomplete
            if (allSlotsPresentCount < expectedSet.size) {
                incompleteCourses.push({ title, serialNo });
            } else {
                validSerialNos.add(serialNo);
            }
        }

        // Build warning message
        let warningMsg = "";
        if (invalidCourses.length > 0 || incompleteCourses.length > 0) {
            if (invalidCourses.length > 0) {
                warningMsg += "以下課程不存在或已下架，將被忽略：\n\n";
                invalidCourses.forEach(({ title, serialNo }) => {
                    warningMsg += `• ${title} (${serialNo})\n`;
                });
            }

            if (incompleteCourses.length > 0) {
                if (warningMsg) warningMsg += "\n";
                warningMsg += "以下課程的時段不完整，將被忽略：\n\n";
                incompleteCourses.forEach(({ title, serialNo }) => {
                    warningMsg += `• ${title} (${serialNo})\n`;
                });
            }

            warningMsg += `\n共 ${invalidCourses.length + incompleteCourses.length} 門課程被忽略。`;

            if (validSerialNos.size > 0) {
                warningMsg += `\n將匯入 ${validSerialNos.size} 門有效課程。`;
            }
        }

        // If there are no valid courses, show error
        if (validSerialNos.size === 0) {
            alert(warningMsg || "檔案中的課程全部無效");
            return;
        }

        // Show warning if there are invalid or incomplete courses
        if (invalidCourses.length > 0 || incompleteCourses.length > 0) {
            alert(warningMsg);
        }

        // Clear current selection and add only valid courses
        state.selectedIds.clear();
        for (const serialNo of validSerialNos) {
            state.selectedIds.add(serialNo);
        }
        saveSelection();
        renderPlanner();
        alert(`成功匯入 ${validSerialNos.size} 門課程`);
    };
    reader.readAsText(file);
}

// Expose select helpers for local debugging/validation (localhost only)
try {
    if (typeof window !== "undefined" && (location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
        window.__plannerDebug = {
            parseSlots,
            expandSections,
            normalizeDay,
            formatTimeLabel,
            formatTimeInfo
        };
    }
} catch (e) {
    // ignore in non-browser contexts
}

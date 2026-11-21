(function () {
  const STORAGE_KEY = "random-group-maker.saved-results.v1";
  const elements = {
    form: document.getElementById("group-form"),
    studentList: document.getElementById("student-list"),
    conflictPairs: document.getElementById("conflict-pairs"),
    studentCount: document.getElementById("student-count"),
    clearStudents: document.getElementById("clear-students"),
    groupValue: document.getElementById("group-value"),
    groupValueLabel: document.getElementById("group-value-label"),
    groupValueSuffix: document.getElementById("group-value-suffix"),
    modeInputs: [...document.querySelectorAll('input[name="mode"]')],
    resultSummary: document.getElementById("result-summary"),
    resultActions: document.getElementById("result-actions"),
    resultContent: document.getElementById("result-content"),
    resultText: document.getElementById("result-text"),
    statusMessage: document.getElementById("status-message"),
    reshuffle: document.getElementById("reshuffle"),
    saveName: document.getElementById("save-name"),
    saveResult: document.getElementById("save-result"),
    downloadResult: document.getElementById("download-result"),
    copyResult: document.getElementById("copy-result"),
    printResult: document.getElementById("print-result"),
    savedList: document.getElementById("saved-list"),
    savedEmpty: document.getElementById("saved-empty"),
    savedCount: document.getElementById("saved-count"),
  };

  let current = null;
  let savedResults = [];

  function selectedMode() {
    return elements.modeInputs.find((input) => input.checked).value;
  }

  function getFormData() {
    const students = Grouping.parseStudents(elements.studentList.value);
    if (students.length === 0) {
      throw new Error("학생 이름을 한 명 이상 입력해 주세요.");
    }

    const mode = selectedMode();
    const value = Grouping.validateGroupValue(elements.groupValue.value);
    Grouping.getGroupCount(students.length, mode, value);
    const conflictText = elements.conflictPairs.value;
    const conflicts = Grouping.parseConflictPairs(conflictText, students);
    return { students, mode, value, conflictText, conflicts };
  }

  function setStatus(message, isError = false, isWarning = false) {
    elements.statusMessage.textContent = message;
    elements.statusMessage.classList.toggle("is-error", isError);
    elements.statusMessage.classList.toggle("is-warning", isWarning);
  }

  function renderStudentCount() {
    const count = Grouping.parseStudents(elements.studentList.value).length;
    elements.studentCount.textContent = `학생 ${count}명`;
  }

  function updateCriteriaLabel() {
    const mode = selectedMode();
    const isGroupCount = mode === "groups";
    elements.groupValueLabel.textContent = isGroupCount ? "모둠 수" : "모둠별 인원";
    elements.groupValueSuffix.textContent = isGroupCount ? "모둠" : "명씩";
    elements.groupValue.setAttribute(
      "aria-label",
      isGroupCount ? "모둠 수" : "모둠별 인원 수",
    );
    setStatus("");
  }

  function renderGroups(groups) {
    const grid = document.createElement("div");
    grid.className = "group-grid";
    grid.setAttribute("aria-label", "편성된 모둠");

    groups.forEach((group, index) => {
      const card = document.createElement("article");
      card.className = "group-card";

      const header = document.createElement("div");
      header.className = "group-card-header";
      const title = document.createElement("h3");
      title.textContent = `모둠 ${index + 1}`;
      const count = document.createElement("span");
      count.textContent = String(group.length);
      count.setAttribute("aria-label", `${group.length}명`);
      header.append(title, count);

      const list = document.createElement("ul");
      list.className = "group-students";
      group.forEach((name) => {
        const student = document.createElement("li");
        student.textContent = name;
        list.append(student);
      });

      card.append(header, list);
      grid.append(card);
    });

    elements.resultContent.replaceChildren(grid);
  }

  function showGroups(groups, announce = "", violations = 0) {
    current.groups = groups;
    renderGroups(groups);
    elements.resultSummary.textContent =
      `${groups.length}개 모둠 · ${current.students.length}명`;
    elements.resultSummary.classList.add("is-ready");
    elements.resultActions.hidden = false;
    elements.reshuffle.hidden = false;
    elements.resultText.textContent = Grouping.formatGroups(groups);
    elements.resultText.hidden = true;
    if (violations > 0) {
      setStatus(
        `갈등 관계 ${violations}쌍을 모두 분리하지 못했어요. 현재 결과를 확인하고 필요하면 모둠 수를 조정해 주세요.`,
        false,
        true,
      );
    } else {
      setStatus(announce);
    }
  }

  function createFromForm() {
    const formData = getFormData();
    const result = Grouping.createGroupsWithConstraints(
      formData.students,
      formData.mode,
      formData.value,
      formData.conflicts,
    );
    current = {
      ...formData,
      groups: result.groups,
      violations: result.violations,
    };
    showGroups(
      current.groups,
      formData.conflicts.length > 0
        ? "갈등 학생을 서로 다른 모둠으로 배정했어요."
        : "새 모둠을 만들었어요.",
      current.violations,
    );
  }

  function getStorage() {
    try {
      return window.localStorage;
    } catch (error) {
      throw new Error("브라우저 저장소에 접근할 수 없습니다. 브라우저 설정을 확인해 주세요.");
    }
  }

  function isSavedResult(value) {
    return (
      value &&
      typeof value.id === "string" &&
      typeof value.name === "string" &&
      typeof value.createdAt === "string" &&
      Number.isFinite(Date.parse(value.createdAt)) &&
      (value.conflictText === undefined || typeof value.conflictText === "string") &&
      (value.violations === undefined ||
        (Number.isSafeInteger(value.violations) && value.violations >= 0)) &&
      Array.isArray(value.students) &&
      value.students.length > 0 &&
      value.students.every((student) => typeof student === "string") &&
      (value.mode === "groups" || value.mode === "size") &&
      Number.isSafeInteger(value.value) &&
      value.value > 0 &&
      Array.isArray(value.groups) &&
      value.groups.length > 0 &&
      value.groups.every(
        (group) =>
          Array.isArray(group) &&
          group.length > 0 &&
          group.every((student) => typeof student === "string"),
      ) &&
      sameStudents(value.students, value.groups.flat())
    );
  }

  function sameStudents(first, second) {
    if (first.length !== second.length) {
      return false;
    }
    const counts = new Map();
    first.forEach((student) => counts.set(student, (counts.get(student) || 0) + 1));
    second.forEach((student) => counts.set(student, (counts.get(student) || 0) - 1));
    return [...counts.values()].every((count) => count === 0);
  }

  function readSavedResults() {
    const raw = getStorage().getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error("저장된 모둠 데이터를 읽을 수 없습니다. 저장 목록을 초기화해 주세요.");
    }

    if (!Array.isArray(parsed) || !parsed.every(isSavedResult)) {
      throw new Error("저장된 모둠 데이터 형식이 올바르지 않습니다.");
    }
    return parsed;
  }

  function writeSavedResults(results) {
    try {
      getStorage().setItem(STORAGE_KEY, JSON.stringify(results));
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") {
        throw new Error("브라우저 저장 공간이 부족합니다. 기존 저장 결과를 삭제해 주세요.");
      }
      throw new Error("모둠을 저장하지 못했습니다. 브라우저 저장 설정을 확인해 주세요.");
    }
  }

  function renderSavedResults() {
    elements.savedList.replaceChildren();
    elements.savedCount.textContent = String(savedResults.length);
    elements.savedEmpty.hidden = savedResults.length > 0;

    savedResults.forEach((result) => {
      const item = document.createElement("li");
      item.className = "saved-item";

      const loadButton = document.createElement("button");
      loadButton.type = "button";
      loadButton.className = "saved-load";
      loadButton.dataset.action = "load";
      loadButton.dataset.id = result.id;

      const name = document.createElement("strong");
      name.textContent = result.name;
      const date = document.createElement("small");
      date.textContent = new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(result.createdAt));
      loadButton.append(name, date);

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "saved-delete";
      deleteButton.dataset.action = "delete";
      deleteButton.dataset.id = result.id;
      deleteButton.setAttribute("aria-label", `${result.name} 삭제`);
      deleteButton.textContent = "×";

      item.append(loadButton, deleteButton);
      elements.savedList.append(item);
    });
  }

  function saveCurrentResult() {
    if (!current) {
      throw new Error("먼저 모둠을 만들어 주세요.");
    }

    const now = new Date();
    const name = elements.saveName.value.trim() || `모둠 결과 ${new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(now)}`;
    const saved = {
      id: makeId(),
      name,
      createdAt: now.toISOString(),
      students: [...current.students],
      mode: current.mode,
      value: current.value,
      conflictText: current.conflictText,
      violations: current.violations,
      groups: current.groups.map((group) => [...group]),
    };
    const updated = [saved, ...savedResults];
    writeSavedResults(updated);
    savedResults = updated;
    renderSavedResults();
    elements.saveName.value = "";
    setStatus(`“${name}” 결과를 이 브라우저에 저장했어요.`);
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function loadSavedResult(id) {
    const result = savedResults.find((entry) => entry.id === id);
    if (!result) {
      throw new Error("저장된 모둠을 찾을 수 없습니다.");
    }

    current = {
      students: [...result.students],
      mode: result.mode,
      value: result.value,
      conflictText: result.conflictText || "",
      conflicts: Grouping.parseConflictPairs(result.conflictText || "", result.students),
      violations: result.violations || 0,
      groups: result.groups.map((group) => [...group]),
    };
    elements.studentList.value = result.students.join("\n");
    elements.conflictPairs.value = result.conflictText || "";
    elements.modeInputs.forEach((input) => {
      input.checked = input.value === result.mode;
    });
    elements.groupValue.value = String(result.value);
    updateCriteriaLabel();
    renderStudentCount();
    showGroups(current.groups, `“${result.name}” 결과를 불러왔어요.`, current.violations);
  }

  function deleteSavedResult(id) {
    const result = savedResults.find((entry) => entry.id === id);
    if (!result) {
      throw new Error("삭제할 모둠을 찾을 수 없습니다.");
    }
    const updated = savedResults.filter((entry) => entry.id !== id);
    writeSavedResults(updated);
    savedResults = updated;
    renderSavedResults();
    setStatus(`“${result.name}” 결과를 삭제했어요.`);
  }

  function downloadCsv() {
    if (!current) {
      throw new Error("먼저 모둠을 만들어 주세요.");
    }

    const blob = new Blob([Grouping.groupsToCsv(current.groups)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `모둠-결과-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("CSV 파일을 다운로드했어요.");
  }

  async function copyResult() {
    if (!current) {
      throw new Error("먼저 모둠을 만들어 주세요.");
    }
    const text = Grouping.formatGroups(current.groups);
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error("클립보드 기능을 사용할 수 없습니다.");
      }
      await navigator.clipboard.writeText(text);
      setStatus("모둠 결과를 복사했어요.");
    } catch (error) {
      elements.resultText.hidden = false;
      elements.resultText.focus();
      setStatus("자동 복사에 실패했어요. 아래 결과를 선택해 직접 복사해 주세요.", true);
    }
  }

  elements.studentList.addEventListener("input", renderStudentCount);
  elements.clearStudents.addEventListener("click", () => {
    elements.studentList.value = "";
    renderStudentCount();
    elements.studentList.focus();
    setStatus("");
  });
  elements.modeInputs.forEach((input) => input.addEventListener("change", updateCriteriaLabel));

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      createFromForm();
    } catch (error) {
      setStatus(error.message, true);
      if (error.message.includes("학생 이름")) {
        elements.studentList.focus();
      } else if (error.message.includes("갈등") || error.message.includes("동명이인")) {
        elements.conflictPairs.focus();
      } else {
        elements.groupValue.focus();
      }
    }
  });

  elements.reshuffle.addEventListener("click", () => {
    try {
      const formData = getFormData();
      const result = Grouping.createGroupsWithConstraints(
        formData.students,
        formData.mode,
        formData.value,
        formData.conflicts,
      );
      current = {
        ...formData,
        groups: result.groups,
        violations: result.violations,
      };
      showGroups(
        current.groups,
        "같은 기준으로 다시 섞었어요.",
        current.violations,
      );
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  elements.saveResult.addEventListener("click", () => {
    try {
      saveCurrentResult();
    } catch (error) {
      setStatus(error.message, true);
    }
  });
  elements.downloadResult.addEventListener("click", () => {
    try {
      downloadCsv();
    } catch (error) {
      setStatus(error.message, true);
    }
  });
  elements.copyResult.addEventListener("click", copyResult);
  elements.printResult.addEventListener("click", () => window.print());

  elements.savedList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    try {
      if (button.dataset.action === "load") {
        loadSavedResult(button.dataset.id);
      } else {
        deleteSavedResult(button.dataset.id);
      }
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  try {
    savedResults = readSavedResults();
    renderSavedResults();
  } catch (error) {
    renderSavedResults();
    setStatus(error.message, true);
  }
  renderStudentCount();
})();

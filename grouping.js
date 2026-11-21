(function (root, factory) {
  const grouping = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = grouping;
  }

  if (root) {
    root.Grouping = grouping;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function parseStudents(input) {
    return input
      .split(/[\n,]/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  function validateGroupValue(value) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1) {
      throw new Error("모둠 기준은 1 이상의 정수로 입력해 주세요.");
    }
    return number;
  }

  function getGroupCount(studentCount, mode, value) {
    const number = validateGroupValue(value);

    if (!Number.isSafeInteger(studentCount) || studentCount < 1) {
      throw new Error("학생 이름을 한 명 이상 입력해 주세요.");
    }

    if (mode === "groups") {
      if (number > studentCount) {
        throw new Error("모둠 수는 학생 수보다 많을 수 없습니다.");
      }
      return number;
    }

    if (mode === "size") {
      return Math.ceil(studentCount / number);
    }

    throw new Error("모둠 편성 기준을 선택해 주세요.");
  }

  function shuffle(items, random = Math.random) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  function parseConflictPairs(input, students) {
    const pairs = [];
    const seenPairs = new Set();

    input.split(/\r?\n/).forEach((line, lineIndex) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        return;
      }

      const names = trimmedLine.split(",").map((name) => name.trim());
      if (names.length !== 2 || names.some((name) => !name)) {
        throw new Error(
          `갈등 관계 ${lineIndex + 1}번째 줄은 “학생 이름, 학생 이름” 형식으로 입력해 주세요.`,
        );
      }

      const firstIndex = resolveStudentIndex(names[0], students, lineIndex);
      const secondIndex = resolveStudentIndex(names[1], students, lineIndex);
      if (firstIndex === secondIndex) {
        throw new Error(`갈등 관계 ${lineIndex + 1}번째 줄에 서로 다른 학생 두 명을 입력해 주세요.`);
      }

      const pair = firstIndex < secondIndex
        ? [firstIndex, secondIndex]
        : [secondIndex, firstIndex];
      const key = pair.join(":");
      if (!seenPairs.has(key)) {
        pairs.push(pair);
        seenPairs.add(key);
      }
    });

    return pairs;
  }

  function resolveStudentIndex(token, students, lineIndex) {
    const occurrenceMatch = token.match(/^(.*)#([1-9]\d*)$/);
    const name = occurrenceMatch ? occurrenceMatch[1].trim() : token;
    const occurrence = occurrenceMatch ? Number(occurrenceMatch[2]) : null;
    const matchingIndices = students
      .map((student, index) => (student === name ? index : -1))
      .filter((index) => index !== -1);

    if (matchingIndices.length === 0) {
      throw new Error(`갈등 관계 ${lineIndex + 1}번째 줄에서 “${token}” 학생을 명단에서 찾을 수 없습니다.`);
    }

    if (occurrence !== null) {
      if (occurrence > matchingIndices.length) {
        throw new Error(`“${token}” 학생을 명단에서 찾을 수 없습니다.`);
      }
      return matchingIndices[occurrence - 1];
    }

    if (matchingIndices.length > 1) {
      throw new Error(
        `동명이인 “${name}”을(를) 구분하려면 이름 뒤에 순번을 붙여 주세요. 예: ${name}#2`,
      );
    }
    return matchingIndices[0];
  }

  function getGroupSizes(studentCount, groupCount) {
    const baseSize = Math.floor(studentCount / groupCount);
    const largerGroupCount = studentCount % groupCount;
    return Array.from(
      { length: groupCount },
      (_, index) => baseSize + (index < largerGroupCount ? 1 : 0),
    );
  }

  function createGroups(students, mode, value, random = Math.random) {
    if (!Array.isArray(students) || students.length === 0) {
      throw new Error("학생 이름을 한 명 이상 입력해 주세요.");
    }

    const groupCount = getGroupCount(students.length, mode, value);
    const shuffled = shuffle(students, random);
    const groups = Array.from({ length: groupCount }, () => []);
    const groupSizes = getGroupSizes(students.length, groupCount);
    let offset = 0;

    groups.forEach((group, index) => {
      group.push(...shuffled.slice(offset, offset + groupSizes[index]));
      offset += groupSizes[index];
    });

    return groups;
  }

  function createGroupsWithConstraints(students, mode, value, conflictPairs, random = Math.random) {
    if (!Array.isArray(students) || students.length === 0) {
      throw new Error("학생 이름을 한 명 이상 입력해 주세요.");
    }

    const groupCount = getGroupCount(students.length, mode, value);
    validateConflictIndices(conflictPairs, students.length);
    if (conflictPairs.length === 0) {
      return { groups: createGroups(students, mode, value, random), violations: 0 };
    }

    const adjacency = Array.from({ length: students.length }, () => new Set());
    conflictPairs.forEach(([first, second]) => {
      adjacency[first].add(second);
      adjacency[second].add(first);
    });

    const groupSizes = getGroupSizes(students.length, groupCount);
    const maxAttempts = Math.min(120, Math.max(40, students.length * 2));
    let bestGroups = null;
    let bestViolations = Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < maxAttempts && bestViolations > 0; attempt += 1) {
      const order = shuffle(
        Array.from({ length: students.length }, (_, index) => index),
        random,
      ).sort((first, second) => adjacency[second].size - adjacency[first].size);
      const groupIndices = Array.from({ length: groupCount }, () => []);
      const remaining = [...groupSizes];
      let violations = 0;

      order.forEach((studentIndex) => {
        let fewestConflicts = Number.POSITIVE_INFINITY;
        const candidates = [];

        groupIndices.forEach((group, groupIndex) => {
          if (remaining[groupIndex] === 0) {
            return;
          }
          const conflictsInGroup = group.reduce(
            (total, assignedIndex) =>
              total + (adjacency[studentIndex].has(assignedIndex) ? 1 : 0),
            0,
          );
          if (conflictsInGroup < fewestConflicts) {
            fewestConflicts = conflictsInGroup;
            candidates.length = 0;
            candidates.push(groupIndex);
          } else if (conflictsInGroup === fewestConflicts) {
            candidates.push(groupIndex);
          }
        });

        const groupIndex = candidates[Math.floor(random() * candidates.length)];
        violations += fewestConflicts;
        groupIndices[groupIndex].push(studentIndex);
        remaining[groupIndex] -= 1;
      });

      if (violations < bestViolations) {
        bestViolations = violations;
        bestGroups = groupIndices.map((group) => group.map((index) => students[index]));
      }
    }

    return { groups: bestGroups, violations: bestViolations };
  }

  function validateConflictIndices(conflictPairs, studentCount) {
    if (!Array.isArray(conflictPairs)) {
      throw new Error("갈등 관계 정보가 올바르지 않습니다.");
    }
    conflictPairs.forEach((pair) => {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        !pair.every((index) => Number.isSafeInteger(index) && index >= 0 && index < studentCount) ||
        pair[0] === pair[1]
      ) {
        throw new Error("갈등 관계 정보가 올바르지 않습니다.");
      }
    });
  }

  function formatGroups(groups) {
    return groups
      .map((group, index) => `모둠 ${index + 1}\n${group.map((name) => `- ${name}`).join("\n")}`)
      .join("\n\n");
  }

  function csvCell(value) {
    let text = String(value);
    if (/^[\t\r ]*[=+\-@]/.test(text)) {
      text = `'${text}`;
    }
    return `"${text.replace(/"/g, '""')}"`;
  }

  function groupsToCsv(groups) {
    const rows = [["모둠", "학생 이름"]];
    groups.forEach((group, index) => {
      group.forEach((name) => rows.push([`모둠 ${index + 1}`, name]));
    });
    return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  }

  return {
    createGroups,
    createGroupsWithConstraints,
    formatGroups,
    getGroupCount,
    groupsToCsv,
    parseConflictPairs,
    parseStudents,
    validateGroupValue,
  };
});

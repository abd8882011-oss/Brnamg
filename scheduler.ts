
import { Teacher, ClassSection, Subject, Assignment, WorkingSettings, WeeklySchedule, ScheduleSlot } from './types';

export const generateSchedule = (
  teachers: Teacher[],
  classes: ClassSection[],
  subjects: Subject[],
  assignments: Assignment[],
  settings: WorkingSettings
): WeeklySchedule => {
  const schedule: WeeklySchedule = {};

  // Initialize empty schedule
  classes.forEach(cls => {
    schedule[cls.id] = {};
    settings.workingDays.forEach(day => {
      schedule[cls.id][day] = {};
      for (let p = 1; p <= settings.periodsPerDay; p++) {
        schedule[cls.id][day][p] = null;
      }
    });
  });

  // Track teacher occupancy [teacherId][day][period]
  const teacherOccupancy: Record<string, Record<number, Record<number, boolean>>> = {};
  teachers.forEach(t => {
    teacherOccupancy[t.id] = {};
    settings.workingDays.forEach(day => {
      teacherOccupancy[t.id][day] = {};
      if (t.unavailableSlots && t.unavailableSlots[day]) {
        t.unavailableSlots[day].forEach(period => {
          teacherOccupancy[t.id][day][period] = true;
        });
      }
    });
  });

  const lessonUnits = assignments.flatMap(a => {
    const units = [];
    for (let i = 0; i < a.hoursPerWeek; i++) {
      units.push({ ...a });
    }
    return units;
  });

  const shuffledUnits = [...lessonUnits].sort(() => Math.random() - 0.5);

  shuffledUnits.forEach(unit => {
    let placed = false;
    const dayPool = [...settings.workingDays].sort(() => Math.random() - 0.5);

    for (let day of dayPool) {
      if (placed) break;
      for (let p = 1; p <= settings.periodsPerDay; p++) {
        if (!schedule[unit.classId][day][p] && !teacherOccupancy[unit.teacherId][day][p]) {
          const slot: ScheduleSlot = {
            assignmentId: unit.id,
            teacherId: unit.teacherId,
            subjectId: unit.subjectId,
            classId: unit.classId
          };
          schedule[unit.classId][day][p] = slot;
          teacherOccupancy[unit.teacherId][day][p] = true;
          placed = true;
          break;
        }
      }
    }
  });

  return schedule;
};

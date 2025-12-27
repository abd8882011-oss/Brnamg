
export interface Teacher {
  id: string;
  name: string;
  unavailableSlots?: Record<number, number[]>; // dayIndex -> array of period numbers
}

export interface ClassSection {
  id: string;
  name: string;
}

export interface Subject {
  id: string;
  name: string;
}

export interface Assignment {
  id: string;
  teacherId: string;
  subjectId: string;
  classId: string;
  hoursPerWeek: number;
}

export interface WorkingSettings {
  workingDays: number[]; // 0 for Sunday, 1 for Monday...
  periodsPerDay: number;
  weekendDay: number;
}

export interface ScheduleSlot {
  assignmentId: string;
  teacherId: string;
  subjectId: string;
  classId: string;
}

export type WeeklySchedule = Record<string, Record<number, Record<number, ScheduleSlot | null>>>; // [classId][day][period]

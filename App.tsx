
import React, { useState, useMemo, useEffect } from 'react';
import { Teacher, ClassSection, Subject, Assignment, WeeklySchedule, ScheduleSlot } from './types';
import { DAYS_OF_WEEK, ICONS } from './constants';
import { generateSchedule } from './scheduler';
import { getScheduleAdvice } from './geminiService';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const STORAGE_KEY = 'school_scheduler_db_v1';

const App: React.FC = () => {
  // State for inputs
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [settings, setSettings] = useState({
    workingDays: [0, 1, 2, 3, 4],
    periodsPerDay: 7,
    weekendDay: 5
  });

  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [isTeacherViewOpen, setIsTeacherViewOpen] = useState(false);
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);

  const [newTeacherName, setNewTeacherName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  
  const [assignTeacher, setAssignTeacher] = useState('');
  const [assignSubject, setAssignSubject] = useState('');
  const [assignClass, setAssignClass] = useState('');
  const [assignHours, setAssignHours] = useState(1);

  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'inputs' | 'schedule' | 'settings' | 'reports' | 'backup'>('inputs');
  const [dbStatus, setDbStatus] = useState<'connected' | 'saving' | 'idle'>('connected');

  // Load Data
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        if (data.teachers) setTeachers(data.teachers);
        if (data.classes) setClasses(data.classes);
        if (data.subjects) setSubjects(data.subjects);
        if (data.assignments) setAssignments(data.assignments);
        if (data.settings) setSettings(data.settings);
        if (data.schedule) setSchedule(data.schedule);
      } catch (err) {
        console.error("Failed to load database:", err);
      }
    }
  }, []);

  // Auto-save
  useEffect(() => {
    const saveData = () => {
      setDbStatus('saving');
      const data = {
        teachers,
        classes,
        subjects,
        assignments,
        settings,
        schedule
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setTimeout(() => setDbStatus('idle'), 500);
    };

    const timer = setTimeout(saveData, 1000);
    return () => clearTimeout(timer);
  }, [teachers, classes, subjects, assignments, settings, schedule]);

  const handleExcelImportComprehensive = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheet1 = workbook.Sheets[workbook.SheetNames[0]];
        const data1 = XLSX.utils.sheet_to_json(sheet1, { header: 1 }) as any[][];
        const rows1 = data1.slice(1);

        const rawTeachers = rows1.map(row => row[0]).filter(Boolean).map(String);
        const rawClasses = rows1.map(row => row[1]).filter(Boolean).map(String);
        const rawSubjects = rows1.map(row => row[2]).filter(Boolean).map(String);

        const newTeachers = [...new Set(rawTeachers)].map(n => ({ id: crypto.randomUUID(), name: n.trim() }));
        const newClasses = [...new Set(rawClasses)].map(n => ({ id: crypto.randomUUID(), name: n.trim() }));
        const newSubjects = [...new Set(rawSubjects)].map(n => ({ id: crypto.randomUUID(), name: n.trim() }));

        setTeachers(newTeachers);
        setClasses(newClasses);
        setSubjects(newSubjects);

        if (workbook.SheetNames.length > 1) {
          const sheet2 = workbook.Sheets[workbook.SheetNames[1]];
          const data2 = XLSX.utils.sheet_to_json(sheet2, { header: 1 }) as any[][];
          const rows2 = data2.slice(1);
          const newAssignments: Assignment[] = [];
          rows2.forEach(row => {
            const t = newTeachers.find(x => x.name === String(row[0] || '').trim());
            const s = newSubjects.find(x => x.name === String(row[1] || '').trim());
            const c = newClasses.find(x => x.name === String(row[2] || '').trim());
            if (t && s && c) {
              newAssignments.push({ id: crypto.randomUUID(), teacherId: t.id, subjectId: s.id, classId: c.id, hoursPerWeek: parseInt(row[3]) || 1 });
            }
          });
          setAssignments(newAssignments);
        }
        alert('تم الاستيراد بنجاح');
      } catch (err) { alert('خطأ في الملف'); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleBackup = () => {
    const data = { teachers, classes, subjects, assignments, settings };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `نسخة_احتياطية_البرنامج_الأسبوعي_${new Date().toLocaleDateString('ar-EG').replace(/\//g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        if (data.teachers && data.classes && data.subjects && data.assignments && data.settings) {
          if (window.confirm('سيتم استبدال البيانات الحالية بالنسخة الاحتياطية، هل تريد المتابعة؟')) {
            setTeachers(data.teachers);
            setClasses(data.classes);
            setSubjects(data.subjects);
            setAssignments(data.assignments);
            setSettings(data.settings);
            setSchedule(null);
            alert('تم استعادة البيانات بنجاح.');
          }
        }
      } catch (err) { alert('خطأ في الاستعادة'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearDatabase = () => {
    if (window.confirm('مسح قاعدة البيانات نهائياً؟')) {
      localStorage.removeItem(STORAGE_KEY);
      setTeachers([]); setClasses([]); setSubjects([]); setAssignments([]); setSchedule(null);
      setSettings({ workingDays: [0, 1, 2, 3, 4], periodsPerDay: 7, weekendDay: 5 });
      setActiveTab('inputs');
    }
  };

  const handleGenerate = () => {
    if (assignments.length === 0) return alert('أضف الأنصبة أولاً');
    setIsGenerating(true);
    setTimeout(() => {
      const result = generateSchedule(teachers, classes, subjects, assignments, settings);
      setSchedule(result);
      setIsGenerating(false);
      setActiveTab('schedule');
    }, 600);
  };

  const getTeacherName = (id: string) => teachers.find(t => t.id === id)?.name || 'مجهول';
  const getSubjectName = (id: string) => subjects.find(s => s.id === id)?.name || 'مجهول';
  const getClassName = (id: string) => classes.find(c => c.id === id)?.name || 'مجهول';

  const analysis = useMemo(() => {
    const classRep: Record<string, Record<string, number>> = {};
    const teachRep: Record<string, { total: number, classBreakdown: Record<string, number> }> = {};
    const errs: string[] = [];
    const suggests: { teacherId: string, classId: string, day: number, period: number }[] = [];

    classes.forEach(c => classRep[c.id] = {});
    teachers.forEach(t => teachRep[t.id] = { total: 0, classBreakdown: {} });

    if (schedule) {
      Object.entries(schedule).forEach(([classId, days]) => {
        Object.entries(days).forEach(([day, periods]) => {
          Object.values(periods).forEach((slot: ScheduleSlot | null) => {
            if (slot) {
              classRep[classId][slot.subjectId] = (classRep[classId][slot.subjectId] || 0) + 1;
              if (teachRep[slot.teacherId]) {
                teachRep[slot.teacherId].total += 1;
                teachRep[slot.teacherId].classBreakdown[classId] = (teachRep[slot.teacherId].classBreakdown[classId] || 0) + 1;
              }
            }
          });
        });
      });

      assignments.forEach(a => {
        let actual = 0;
        Object.values(schedule).forEach(days => {
          Object.values(days).forEach(periods => {
            Object.values(periods).forEach((slot: ScheduleSlot | null) => {
              if (slot && slot.teacherId === a.teacherId && slot.subjectId === a.subjectId && slot.classId === a.classId) actual++;
            });
          });
        });

        if (actual < a.hoursPerWeek) {
          errs.push(`${getTeacherName(a.teacherId)}: عجز في فصل ${getClassName(a.classId)}`);
          const t = teachers.find(x => x.id === a.teacherId);
          settings.workingDays.forEach(day => {
            for (let p = 1; p <= settings.periodsPerDay; p++) {
              if (!schedule[a.classId][day][p] && t?.unavailableSlots?.[day]?.includes(p)) {
                suggests.push({ teacherId: a.teacherId, classId: a.classId, day, period: p });
              }
            }
          });
        }
      });
    }
    return { classRep, teachRep, mismatches: errs, suggestions: suggests };
  }, [schedule, assignments, classes, teachers, settings]);

  const getTeacherColor = (id: string) => {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];
    let hash = 0; for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900" dir="rtl">
      <aside className="w-full md:w-64 bg-indigo-900 text-white p-6 sticky top-0 md:h-screen flex flex-col shadow-xl z-20 no-print">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-white p-2 rounded-lg text-indigo-900"><ICONS.Calendar className="w-6 h-6" /></div>
          <h1 className="text-xl font-bold tracking-tight">البرنامج الأسبوعي</h1>
        </div>
        <nav className="flex-1 space-y-2">
          <button onClick={() => setActiveTab('inputs')} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'inputs' ? 'bg-indigo-700 shadow-inner' : 'hover:bg-indigo-800'}`}><ICONS.Users className="w-5 h-5 opacity-70" /><span>البيانات الأساسية</span></button>
          <button onClick={() => setActiveTab('schedule')} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'schedule' ? 'bg-indigo-700 shadow-inner' : 'hover:bg-indigo-800'}`}><ICONS.Sparkles className="w-5 h-5 opacity-70" /><span>جدول الحصص</span>{analysis.mismatches.length > 0 && <span className="mr-auto w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>}</button>
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'settings' ? 'bg-indigo-700 shadow-inner' : 'hover:bg-indigo-800'}`}><ICONS.Settings className="w-5 h-5 opacity-70" /><span>الإعدادات</span></button>
          <button onClick={() => setActiveTab('reports')} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'reports' ? 'bg-indigo-700 shadow-inner' : 'hover:bg-indigo-800'}`}><ICONS.BarChart className="w-5 h-5 opacity-70" /><span>الإحصائيات</span></button>
          <button onClick={() => setActiveTab('backup')} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'backup' ? 'bg-indigo-700 shadow-inner' : 'hover:bg-indigo-800'}`}><ICONS.Download className="w-5 h-5 opacity-70" /><span>النسخ الاحتياطي</span></button>
        </nav>
        <div className="mt-4 p-3 bg-indigo-950/40 rounded-xl border border-indigo-800 flex items-center gap-3"><div className={`w-2 h-2 rounded-full ${dbStatus === 'saving' ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`}></div><span className="text-[10px] font-bold text-indigo-200">{dbStatus === 'saving' ? 'جاري الحفظ...' : 'قاعدة البيانات متصلة'}</span></div>
        <div className="mt-auto pt-6 border-t border-indigo-800"><button onClick={handleGenerate} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2">{isGenerating ? 'جاري التوزيع...' : 'توزيع الحصص'}</button></div>
      </aside>

      <main className="flex-1 p-4 md:p-10 overflow-y-auto flex flex-col min-h-screen">
        <div className="flex-1">
          {activeTab === 'inputs' && (
            <div className="space-y-8 max-w-5xl mx-auto">
              <header className="flex flex-col md:flex-row justify-between gap-4"><div><h2 className="text-3xl font-bold">البيانات الأساسية</h2><p className="text-slate-500 text-sm">أضف المعلمين والفصول والأنصبة</p></div><div className="flex gap-2"><button onClick={() => {if(window.confirm('مسح الكل؟')){setTeachers([]);setClasses([]);setSubjects([]);setAssignments([]);}}} className="bg-white border text-rose-500 px-4 py-2 rounded-xl font-bold hover:bg-rose-50">مسح الكل</button><label className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold cursor-pointer">استيراد إكسيل <input type="file" hidden onChange={handleExcelImportComprehensive} /></label></div></header>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border"><h3 className="font-bold mb-4 flex items-center gap-2"><div className="w-1 h-5 bg-indigo-500 rounded"></div>المعلمون</h3><div className="flex gap-2 mb-4"><input type="text" value={newTeacherName} onChange={(e) => setNewTeacherName(e.target.value)} placeholder="الاسم" className="flex-1 p-2 border rounded-lg text-sm" /><button onClick={() => {if(newTeacherName){setTeachers([...teachers, {id:crypto.randomUUID(), name:newTeacherName}]); setNewTeacherName('');}}} className="bg-indigo-500 text-white p-2 rounded-lg"><ICONS.Plus/></button></div><ul className="space-y-2 max-h-64 overflow-auto">{teachers.map(t => (<li key={t.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center text-sm"><span className="font-bold">{t.name}</span><div className="flex gap-1"><button onClick={() => setEditingTeacherId(editingTeacherId === t.id ? null : t.id)} className="text-amber-500 p-1.5"><ICONS.Clock className="w-4 h-4"/></button><button onClick={() => setTeachers(teachers.filter(x => x.id !== t.id))} className="text-rose-400 p-1.5"><ICONS.Trash className="w-4 h-4"/></button></div></li>))}</ul></div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border"><h3 className="font-bold mb-4 flex items-center gap-2"><div className="w-1 h-5 bg-amber-500 rounded"></div>الفصول</h3><div className="flex gap-2 mb-4"><input type="text" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="اسم الفصل" className="flex-1 p-2 border rounded-lg text-sm" /><button onClick={() => {if(newClassName){setClasses([...classes, {id:crypto.randomUUID(), name:newClassName}]); setNewClassName('');}}} className="bg-indigo-500 text-white p-2 rounded-lg"><ICONS.Plus/></button></div><ul className="space-y-2 max-h-64 overflow-auto">{classes.map(c => <li key={c.id} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg text-sm">{c.name} <button onClick={() => setClasses(classes.filter(x => x.id !== c.id))} className="text-rose-400"><ICONS.Trash className="w-4 h-4"/></button></li>)}</ul></div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border"><h3 className="font-bold mb-4 flex items-center gap-2"><div className="w-1 h-5 bg-emerald-500 rounded"></div>المواد</h3><div className="flex gap-2 mb-4"><input type="text" value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} placeholder="اسم المادة" className="flex-1 p-2 border rounded-lg text-sm" /><button onClick={() => {if(newSubjectName){setSubjects([...subjects, {id:crypto.randomUUID(), name:newSubjectName}]); setNewSubjectName('');}}} className="bg-indigo-500 text-white p-2 rounded-lg"><ICONS.Plus/></button></div><ul className="space-y-2 max-h-64 overflow-auto">{subjects.map(s => <li key={s.id} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg text-sm">{s.name} <button onClick={() => setSubjects(subjects.filter(x => x.id !== s.id))} className="text-rose-400"><ICONS.Trash className="w-4 h-4"/></button></li>)}</ul></div>
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="max-w-4xl mx-auto space-y-12">
              <header><h2 className="text-3xl font-bold text-slate-800 mb-2">النسخ الاحتياطي</h2></header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-indigo-600 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden group">
                  <h3 className="text-2xl font-bold mb-4">تصدير البيانات</h3>
                  <button onClick={handleBackup} className="w-full bg-white text-indigo-700 font-bold py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg hover:bg-indigo-50">تصدير النسخة</button>
                </div>
                <div className="bg-white border-2 border-indigo-100 p-8 rounded-[2rem] shadow-sm group">
                  <h3 className="text-2xl font-bold text-indigo-900 mb-4">استيراد البيانات</h3>
                  <label className="w-full bg-indigo-50 text-indigo-700 font-bold py-4 rounded-2xl flex items-center justify-center gap-3 cursor-pointer border-2 border-dashed border-indigo-200">اختيار ملف الاستعادة<input type="file" hidden accept=".json" onChange={handleRestore} /></label>
                </div>
              </div>
              <div className="bg-rose-50 border border-rose-100 p-8 rounded-[2rem] shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
                <div><h3 className="text-xl font-bold text-rose-800 mb-2">منطقة الخطر</h3><p className="text-rose-600 text-sm">سيؤدي مسح قاعدة البيانات إلى حذف كافة البيانات نهائياً.</p></div>
                <button onClick={handleClearDatabase} className="bg-rose-500 text-white px-8 py-4 rounded-2xl font-bold hover:bg-rose-600">مسح قاعدة البيانات</button>
              </div>
            </div>
          )}

          {activeTab === 'schedule' && schedule && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {classes.map(cls => (
                <div key={cls.id} className="bg-white rounded-3xl shadow-sm border mb-10 overflow-hidden">
                  <div className="bg-slate-50 px-6 py-4 border-b font-bold text-slate-800">جدول فصل: {cls.name}</div>
                  <div className="overflow-x-auto"><table className="w-full text-center border-collapse table-fixed min-w-[850px]">
                    <thead className="bg-slate-100"><tr><th className="p-4 border-l border-b w-24 text-sm font-bold">اليوم</th>{Array.from({length: settings.periodsPerDay}).map((_, i) => <th key={i} className="p-4 border-b text-sm font-bold">الحصة {i + 1}</th>)}</tr></thead>
                    <tbody>{settings.workingDays.map(dayId => (<tr key={dayId} className="hover:bg-slate-50/50"><td className="p-4 font-bold border-l border-b bg-indigo-50/30 text-xs text-indigo-900">{DAYS_OF_WEEK.find(d => d.id === dayId)?.name}</td>{Array.from({length: settings.periodsPerDay}).map((_, pIdx) => {const p = pIdx + 1; const slot = schedule[cls.id][dayId][p]; return <td key={p} className="p-2 border-b border-l h-28">{slot ? <div className="bg-indigo-50 rounded-2xl px-2 py-4 border border-indigo-100 h-full flex flex-col justify-center shadow-sm"><div className="font-bold text-indigo-800 text-xs">{getSubjectName(slot.subjectId)}</div><div className="text-[10px] text-indigo-400 font-medium mt-1">{getTeacherName(slot.teacherId)}</div></div> : <span className="text-slate-100">.</span>}</td>;})}</tr>))}</tbody>
                  </table></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="mt-auto py-8 text-center border-t border-slate-200/60 no-print">
          <p className="text-slate-400 text-sm font-medium tracking-wide">تصميم الأستاذ <span className="text-indigo-900 font-bold">عبد الرزاق الموسى</span></p>
        </footer>
      </main>
    </div>
  );
};

export default App;

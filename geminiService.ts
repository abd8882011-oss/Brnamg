
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getScheduleAdvice = async (scheduleData: any) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `بصفتك خبيراً في الجداول المدرسية، قم بتحليل البيانات التالية وقدم 3 نصائح لتحسين توزيع الحصص أو ملاحظات حول التوازن: ${JSON.stringify(scheduleData)}`,
      config: {
        systemInstruction: "أنت مساعد ذكي لتنظيم الجداول المدرسية. قدم إجاباتك باللغة العربية بأسلوب مهني ومختصر.",
      }
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "عذراً، لم أتمكن من تحليل الجدول حالياً.";
  }
};

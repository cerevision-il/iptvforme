const express = require('express'); // 1. ייבוא הספרייה
const app = express();              // 2. יצירת האפליקציה (לפעמים קוראים לזה server)

const PORT = process.env.PORT || 3000; // 3. הגדרת הפורט

app.use(express.static('.'));
// 4. בסוף הקובץ - הפקודה להפעלת השרת:
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

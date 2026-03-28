const express = require('express');
const cors = require('cors'); // ייבוא הספרייה החדשה
const app = express();

app.use(cors()); // הפעלת האישור לכל הבקשות
app.use(express.static('.')); 

const PORT = process.env.PORT || 3000;
// ... שאר הקוד ...
app.use(express.static('.'));
// 4. בסוף הקובץ - הפקודה להפעלת השרת:
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

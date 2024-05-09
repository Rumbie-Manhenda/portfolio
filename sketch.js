const express = require('express');
const mysql = require('mysql');
const app = express();
const multer = require('multer');
const upload = multer();
const PORT = process.env.PORT || 3000;

// Database connection configuration
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Emmanuel@7',
    database: 'portfolio_messages'
});

// Connect to MySQL database
db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to MySQL database');
});

// Body parser middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(upload.array());

// Enable CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Route to handle form submissions for messages
app.post('/submit', (req, res) => {
    const { email, message } = req.body;
    const timestamp = new Date();

    if (!email || !message) {
        return res.status(400).send('Email and message are required');
    }

    const sql = 'INSERT INTO messages (email, timestamp, message) VALUES (?, ?, ?)';
    db.query(sql, [email, timestamp, message], (err, result) => {
        if (err) {
            console.error('Error inserting message:', err);
            res.status(500).send('Error inserting message into database');
        } else {
            console.log("Message sent!");
            res.status(200).send("Message sent successfully !");
        }
    });
});

// Route to handle form submissions for recommendations
app.post('/submit_rec', (req, res) => {
    const { email_rec, message_rec, name_rec } = req.body;
    const timestamp_rec = new Date();

    if (!email_rec || !message_rec || !name_rec) {
        return res.status(400).send('Email, Name and message are required');
    }

    const sql_rec = 'INSERT INTO recommendations (email_rec, name_rec, timestamp_rec, message_rec) VALUES (?, ?, ?, ?)';
    db.query(sql_rec, [email_rec, name_rec, timestamp_rec, message_rec], (err, result) => {
        if (err) {
            console.error('Error inserting recommendation:', err);
            res.status(500).send('Error inserting recommendation into database');
        } else {
            console.log("Recommendation sent!");
            res.status(200).send("Recommendation sent successfully !");
        }
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

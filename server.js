require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const fetch = require('node-fetch');
console.log('fetch typeof at top:', typeof fetch);

let firebase;
try {
    firebase = require('firebase/compat/app');
    require('firebase/compat/database');
} catch (error) {
    console.error('Error loading Firebase SDK:', error);
    process.exit(1);
}

const app = express();
app.use(express.json());

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    databaseURL: process.env.FIREBASE_DATABASE_URL
};

if (!firebaseConfig.apiKey || !firebaseConfig.databaseURL) {
    console.error('Firebase configuration is incomplete. Check your .env file.');
    process.exit(1);
}

try {
    firebase.initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Error initializing Firebase:', error);
    process.exit(1);
}

let db;
try {
    db = firebase.database();
    console.log('Database reference created successfully');
} catch (error) {
    console.error('Error accessing Firebase database:', error);
    process.exit(1);
}

const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function getWeather(city) {
    try {
        console.log('Inside getWeather, fetch typeof:', typeof fetch);
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${WEATHER_API_KEY}&units=metric`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('City not found');
        const data = await response.json();
        return {
            temp: data.main.temp,
            condition: data.weather[0].main,
            description: data.weather[0].description,
            isRain: data.weather[0].main.toLowerCase().includes('rain')
        };
    } catch (error) {
        console.error('Error fetching weather:', error);
        return null;
    }
}

function sendEmail(to, weatherData, city) {
    const { temp, condition, description, isRain } = weatherData;
    const subject = `☂ Your Daily Weather Update for ${city}`;
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f4f4f4; }
                .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #74ebd5, #acb6e5); padding: 20px; text-align: center; color: white; }
                .header h1 { margin: 0; font-size: 24px; }
                .content { padding: 20px; color: #333; }
                .weather-box { background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 15px 0; text-align: center; }
                .weather-box h2 { color: #74ebd5; font-size: 20px; margin-bottom: 10px; }
                .weather-box p { margin: 5px 0; font-size: 16px; }
                .highlight { font-weight: bold; color: #acb6e5; }
                .footer { text-align: center; padding: 15px; font-size: 12px; color: #777; background: #f4f4f4; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Umbrella Reminder</h1>
                </div>
                <div class="content">
                    <p>Hello there!</p>
                    <p>Here’s your weather update for <span class="highlight">${city}</span> today:</p>
                    <div class="weather-box">
                        <h2>${condition}</h2>
                        <p>Temperature: <span class="highlight">${temp}°C</span></p>
                        <p>Details: ${description}</p>
                        <p>${isRain ? '🌧️ <strong>Grab your umbrella!</strong> It’s going to rain today.' : '☀️ No umbrella needed today—enjoy the weather!'}</p>
                    </div>
                    <p>Stay prepared and have a great day!</p>
                </div>
                <div class="footer">
                    <p>Powered by Umbrella Reminder | Unsubscribe anytime</p>
                </div>
            </div>
        </body>
        </html>
    `;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: subject,
        html: html
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Email error:', error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}

// Serve the enhanced frontend
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Umbrella Reminder</title>
            <style>
                :root {
                    --primary: #74ebd5;
                    --secondary: #acb6e5;
                    --bg-light: rgba(255, 255, 255, 0.95);
                    --bg-dark: #2c3e50;
                    --text-light: #333;
                    --text-dark: #ecf0f1;
                    --shadow: rgba(0, 0, 0, 0.2);
                }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Poppins', sans-serif;
                    background: linear-gradient(135deg, var(--primary), var(--secondary));
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    transition: background 0.5s ease;
                }
                body.dark {
                    background: linear-gradient(135deg, #34495e, #2c3e50);
                }
                .container {
                    background: var(--bg-light);
                    padding: 3rem;
                    border-radius: 25px;
                    box-shadow: 0 20px 50px var(--shadow);
                    width: 100%;
                    max-width: 500px;
                    text-align: center;
                    position: relative;
                    transition: background 0.5s ease;
                }
                body.dark .container {
                    background: var(--bg-dark);
                }
                .header {
                    margin-bottom: 2rem;
                }
                h1 {
                    font-size: 2.5rem;
                    font-weight: 700;
                    background: linear-gradient(to right, var(--primary), var(--secondary));
                    -webkit-background-clip: text;
                    color: transparent;
                    letter-spacing: 2px;
                    animation: slideIn 0.8s ease-out;
                }
                body.dark h1 {
                    background: linear-gradient(to right, #74ebd5, #ecf0f1);
                    -webkit-background-clip: text;
                    color: transparent;
                }
                .form-section {
                    margin-bottom: 2rem;
                }
                .input-group {
                    margin-bottom: 1.8rem;
                    position: relative;
                }
                input {
                    width: 100%;
                    padding: 15px;
                    border: 2px solid #e0e0e0;
                    border-radius: 12px;
                    font-size: 1.1rem;
                    background: #fff;
                    transition: all 0.3s ease;
                }
                body.dark input {
                    background: #34495e;
                    border-color: #5d6d7e;
                    color: var(--text-dark);
                }
                input:focus {
                    border-color: var(--primary);
                    box-shadow: 0 0 10px rgba(116, 235, 213, 0.6);
                    outline: none;
                }
                input::placeholder {
                    color: #aaa;
                    opacity: 0.8;
                }
                body.dark input::placeholder {
                    color: #bdc3c7;
                }
                button {
                    width: 100%;
                    padding: 15px;
                    background: linear-gradient(135deg, var(--primary), var(--secondary));
                    border: none;
                    border-radius: 12px;
                    color: white;
                    font-size: 1.2rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 5px 15px rgba(116, 235, 213, 0.4);
                }
                button:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 10px 25px rgba(116, 235, 213, 0.6);
                }
                button:active {
                    transform: translateY(0);
                    box-shadow: 0 5px 15px rgba(116, 235, 213, 0.4);
                }
                .intro {
                    background: #f9f9f9;
                    padding: 1.5rem;
                    border-radius: 15px;
                    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
                    animation: fadeInUp 1s ease-out;
                }
                body.dark .intro {
                    background: #34495e;
                }
                .intro h2 {
                    font-size: 1.5rem;
                    color: var(--primary);
                    margin-bottom: 1rem;
                }
                body.dark .intro h2 {
                    color: #74ebd5;
                }
                .intro p {
                    font-size: 1rem;
                    color: #666;
                    line-height: 1.6;
                }
                body.dark .intro p {
                    color: var(--text-dark);
                }
                .footer {
                    margin-top: 2rem;
                    font-size: 0.95rem;
                    color: #777;
                    opacity: 0.9;
                    animation: fadeIn 1.2s ease-out;
                }
                body.dark .footer {
                    color: #bdc3c7;
                }
                .icon {
                    font-size: 1.5rem;
                    margin-right: 8px;
                    vertical-align: middle;
                }
                .theme-toggle {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: #666;
                    transition: color 0.3s ease;
                }
                body.dark .theme-toggle {
                    color: #ecf0f1;
                }
                @keyframes slideIn {
                    from { opacity: 0; transform: translateX(-20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            </style>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"></script>
            <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-database-compat.js"></script>
        </head>
        <body>
            <div class="container">
                <button class="theme-toggle" onclick="toggleTheme()">
                    <i class="fas fa-moon"></i>
                </button>
                <div class="header">
                    <h1><i class="fas fa-umbrella icon"></i>Umbrella Reminder</h1>
                </div>
                <div class="form-section">
                    <div class="input-group">
                        <input type="email" id="email" placeholder="Your Email" required>
                    </div>
                    <div class="input-group">
                        <input type="text" id="city" placeholder="Your City" required>
                    </div>
                    <div class="input-group">
                        <input type="time" id="time" required>
                    </div>
                    <button onclick="saveReminder()">
                        <i class="fas fa-bell icon"></i>Set Your Reminder
                    </button>
                </div>
                <div class="intro">
                    <h2>What We Do</h2>
                    <p>Stay ahead of the weather with <strong>Umbrella Reminder</strong>! Set a daily reminder, and we’ll send you a stylish email with the latest weather forecast for your city—complete with temperature, conditions, and a heads-up if you’ll need an umbrella. Simple, smart, and designed to keep you prepared.</p>
                </div>
                <div class="footer">Weather updates delivered with a smile!</div>
            </div>

            <script>
                window.onload = function() {
                    const firebaseConfig = {
                        apiKey: "${process.env.FIREBASE_API_KEY}",
                        authDomain: "${process.env.FIREBASE_AUTH_DOMAIN}",
                        projectId: "${process.env.FIREBASE_PROJECT_ID}",
                        storageBucket: "${process.env.FIREBASE_STORAGE_BUCKET}",
                        messagingSenderId: "${process.env.FIREBASE_MESSAGING_SENDER_ID}",
                        appId: "${process.env.FIREBASE_APP_ID}",
                        databaseURL: "${process.env.FIREBASE_DATABASE_URL}"
                    };

                    try {
                        firebase.initializeApp(firebaseConfig);
                        console.log('Frontend Firebase initialized');
                    } catch (error) {
                        console.error('Error initializing Firebase in frontend:', error);
                        alert('Failed to initialize app. Please try again later.');
                        return;
                    }

                    const db = firebase.database();

                    window.saveReminder = function() {
                        const email = document.getElementById('email').value;
                        const city = document.getElementById('city').value;
                        const time = document.getElementById('time').value;

                        if (email && city && time) {
                            db.ref('reminders').push({
                                email: email,
                                city: city,
                                time: time
                            }).then(() => {
                                alert('Reminder set successfully!');
                                document.getElementById('email').value = '';
                                document.getElementById('city').value = '';
                                document.getElementById('time').value = '';
                            }).catch((error) => {
                                alert('Error setting reminder: ' + error.message);
                            });
                        } else {
                            alert('Please fill in all fields.');
                        }
                    };

                    window.toggleTheme = function() {
                        document.body.classList.toggle('dark');
                        const toggleIcon = document.querySelector('.theme-toggle i');
                        toggleIcon.classList.toggle('fa-moon');
                        toggleIcon.classList.toggle('fa-sun');
                    };
                };
            </script>
        </body>
        </html>
    `);
});

cron.schedule('* * * * *', () => {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    db.ref('reminders').once('value')
        .then(async (snapshot) => {
            const reminders = snapshot.val();
            if (reminders) {
                for (let id in reminders) {
                    const { email, city, time } = reminders[id];
                    if (time === currentTime) {
                        const weatherData = await getWeather(city);
                        if (weatherData) {
                            sendEmail(email, weatherData, city);
                        } else {
                            console.log(`Failed to fetch weather for ${city}, skipping email for ${email}`);
                        }
                    }
                }
            }
        })
        .catch((error) => {
            console.error('Error reading from Firebase:', error);
        });
});

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
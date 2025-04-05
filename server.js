require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const fetch = require('node-fetch');

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
    const subject = `☂ Weather Update for ${city}`;
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; background: #f0f4f8; color: #333; }
                .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 15px; overflow: hidden; box-shadow: 0 5px 20px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #6b48ff, #00ddeb); padding: 30px; text-align: center; color: white; }
                .header h1 { margin: 0; font-size: 28px; font-weight: 700; }
                .content { padding: 25px; }
                .weather-card { background: #f9f9f9; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; box-shadow: 0 3px 10px rgba(0,0,0,0.05); }
                .weather-card h2 { font-size: 22px; color: #6b48ff; margin-bottom: 10px; }
                .temp { font-size: 36px; font-weight: 700; color: #00ddeb; margin: 10px 0; }
                .desc { font-size: 16px; color: #666; text-transform: capitalize; }
                .alert { margin-top: 15px; padding: 10px; border-radius: 8px; font-weight: 600; }
                .rain { background: #e0f7fa; color: #0288d1; }
                .sunny { background: #fff3e0; color: #ff9800; }
                .footer { text-align: center; padding: 20px; font-size: 14px; color: #888; background: #f9f9f9; }
                .icon { font-size: 24px; vertical-align: middle; margin-right: 8px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1><span class="icon">☔</span>Umbrella Reminder</h1>
                </div>
                <div class="content">
                    <p>Hello there!</p>
                    <p>Here’s your daily weather update for <strong>${city}</strong>:</p>
                    <div class="weather-card">
                        <h2>${condition}</h2>
                        <div class="temp">${temp}°C</div>
                        <div class="desc">${description}</div>
                        <div class="alert ${isRain ? 'rain' : 'sunny'}">
                            ${isRain ? '🌧️ Bring your umbrella—it’s rainy today!' : '☀️ No umbrella needed—enjoy the sunshine!'}
                        </div>
                    </div>
                    <p>Stay prepared and have an amazing day!</p>
                </div>
                <div class="footer">
                    <p>Sent with ☀️ by Umbrella Reminder | <a href="#" style="color: #6b48ff; text-decoration: none;">Unsubscribe</a></p>
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
            console.error('Email sending failed:', error.message, error.stack);
        } else {
            console.log(`Email sent to ${to} successfully at ${new Date().toISOString()} for ${city}`);
        }
    });
}

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
                    --primary: #6b48ff;
                    --secondary: #00ddeb;
                    --bg-light: #f0f4f8;
                    --bg-dark: #1a1a2e;
                    --text-light: #333;
                    --text-dark: #e0e0e0;
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
                body.dark { background: linear-gradient(135deg, #1a1a2e, #16213e); }
                .container {
                    background: var(--bg-light);
                    padding: 2.5rem;
                    border-radius: 20px;
                    box-shadow: 0 15px 40px rgba(0,0,0,0.2);
                    width: 100%;
                    max-width: 500px;
                    text-align: center;
                    transition: background 0.5s ease;
                }
                body.dark .container { background: var(--bg-dark); color: var(--text-dark); }
                h1 {
                    font-size: 2.5rem;
                    font-weight: 700;
                    background: linear-gradient(to right, var(--primary), var(--secondary));
                    -webkit-background-clip: text;
                    color: transparent;
                    margin-bottom: 1.5rem;
                }
                .input-group {
                    margin-bottom: 1.5rem;
                    position: relative;
                }
                input {
                    width: 100%;
                    padding: 14px;
                    border: 2px solid #ddd;
                    border-radius: 10px;
                    font-size: 1.1rem;
                    transition: all 0.3s ease;
                }
                body.dark input { background: #16213e; border-color: #444; color: var(--text-dark); }
                input:focus {
                    border-color: var(--primary);
                    box-shadow: 0 0 10px rgba(107, 72, 255, 0.5);
                    outline: none;
                }
                input::placeholder { color: #999; }
                body.dark input::placeholder { color: #aaa; }
                button {
                    width: 100%;
                    padding: 14px;
                    background: linear-gradient(135deg, var(--primary), var(--secondary));
                    border: none;
                    border-radius: 10px;
                    color: white;
                    font-size: 1.2rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    margin-bottom: 1rem;
                }
                button:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(107, 72, 255, 0.4); }
                button:active { transform: translateY(0); }
                .weather-preview {
                    background: #fff;
                    border-radius: 10px;
                    padding: 15px;
                    margin-top: 1rem;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                    display: none;
                }
                body.dark .weather-preview { background: #16213e; }
                .weather-preview.active { display: block; }
                .weather-preview h3 { color: var(--primary); font-size: 1.3rem; }
                .weather-preview p { margin: 5px 0; font-size: 1rem; }
                .intro {
                    margin-top: 2rem;
                    padding: 1.5rem;
                    background: rgba(255,255,255,0.8);
                    border-radius: 10px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                }
                body.dark .intro { background: rgba(255,255,255,0.1); }
                .intro h2 { color: var(--primary); font-size: 1.5rem; margin-bottom: 1rem; }
                .theme-toggle {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: #666;
                }
                body.dark .theme-toggle { color: var(--text-dark); }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .container { animation: fadeIn 0.8s ease; }
            </style>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
            <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"></script>
            <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-database-compat.js"></script>
        </head>
        <body>
            <div class="container">
                <button class="theme-toggle" onclick="toggleTheme()"><i class="fas fa-moon"></i></button>
                <h1>Umbrella Reminder</h1>
                <div class="input-group">
                    <input type="email" id="email" placeholder="Your Email" required>
                </div>
                <div class="input-group">
                    <input type="text" id="city" placeholder="Your City" required>
                </div>
                <div class="input-group">
                    <input type="time" id="time" required>
                </div>
                <button onclick="saveReminder()">Set Reminder</button>
                <button onclick="previewWeather()">Preview Weather</button>
                <div class="weather-preview" id="weatherPreview">
                    <h3>Current Weather</h3>
                    <p id="previewTemp"></p>
                    <p id="previewCondition"></p>
                    <p id="previewDesc"></p>
                </div>
                <div class="intro">
                    <h2>Stay Weather-Ready!</h2>
                    <p>Get daily weather updates straight to your inbox with a sleek, personalized email. Know when to grab your umbrella or enjoy the sun!</p>
                </div>
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

                    firebase.initializeApp(firebaseConfig);
                    const db = firebase.database();

                    window.saveReminder = function() {
                        const email = document.getElementById('email').value;
                        const city = document.getElementById('city').value;
                        const time = document.getElementById('time').value;
                        if (email && city && time) {
                            db.ref('reminders').push({ email, city, time })
                                .then(() => {
                                    alert('Reminder set successfully!');
                                    document.getElementById('email').value = '';
                                    document.getElementById('city').value = '';
                                    document.getElementById('time').value = '';
                                })
                                .catch(error => alert('Error: ' + error.message));
                        } else {
                            alert('Please fill in all fields.');
                        }
                    };

                    window.previewWeather = async function() {
                        const city = document.getElementById('city').value;
                        if (!city) {
                            alert('Please enter a city.');
                            return;
                        }
                        const response = await fetch(\`/weather?city=\${city}\`);
                        const data = await response.json();
                        if (data.error) {
                            alert(data.error);
                        } else {
                            document.getElementById('previewTemp').textContent = \`Temperature: \${data.temp}°C\`;
                            document.getElementById('previewCondition').textContent = \`Condition: \${data.condition}\`;
                            document.getElementById('previewDesc').textContent = \`Details: \${data.description}\`;
                            document.getElementById('weatherPreview').classList.add('active');
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
            <script src="https://kit.fontawesome.com/a076d05399.js" crossorigin="anonymous"></script>
        </body>
        </html>
    `);
});

app.get('/weather', async (req, res) => {
    const city = req.query.city;
    const weather = await getWeather(city);
    if (weather) {
        res.json(weather);
    } else {
        res.status(404).json({ error: 'City not found' });
    }
});

cron.schedule('* * * * *', () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istTime = new Date(now.getTime() + istOffset);
    const currentTime = `${istTime.getHours().toString().padStart(2, '0')}:${istTime.getMinutes().toString().padStart(2, '0')}`;

    db.ref('reminders').once('value')
        .then(async (snapshot) => {
            const reminders = snapshot.val();
            if (!reminders) return;

            for (let id in reminders) {
                const { email, city, time } = reminders[id];
                if (time === currentTime) {
                    const weatherData = await getWeather(city);
                    if (weatherData) {
                        sendEmail(email, weatherData, city);
                    }
                }
            }
        })
        .catch((error) => {
            console.error('Error reading from Firebase:', error.message, error.stack);
        });
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Server running on port', process.env.PORT || 3000);
});

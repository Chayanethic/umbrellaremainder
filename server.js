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
} catch (error) {
    process.exit(1);
}

let db;
try {
    db = firebase.database();
} catch (error) {
    process.exit(1);
}

const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const GEONAMES_USERNAME = process.env.GEONAMES_USERNAME;

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
        return null;
    }
}

async function getCitySuggestions(query) {
    try {
        if (!GEONAMES_USERNAME) return [];
        const url = `http://api.geonames.org/searchJSON?q=${query}&maxRows=10&featureClass=P&username=${GEONAMES_USERNAME}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`GeoNames API responded with status: ${response.status}`);
        const data = await response.json();
        if (!data.geonames || !Array.isArray(data.geonames)) return [];
        return data.geonames.map(city => `${city.name}, ${city.countryCode}`);
    } catch (error) {
        return [];
    }
}

async function getCityFromCoords(lat, lon) {
    try {
        const url = `http://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${WEATHER_API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Reverse geocoding failed');
        const data = await response.json();
        if (data.length > 0) {
            return `${data[0].name}, ${data[0].country}`;
        }
        return null;
    } catch (error) {
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
        if (error) return;
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
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" integrity="sha512-1ycn6IcaQQ40/MKBW2W4Rhis/DbILU74C1vSrLJxCq57o941Ym01SwNsOMqvEBFlcgUa6xLiPY/NS5R+E6ztJQ==" crossorigin="anonymous" referrerpolicy="no-referrer" />
            <style>
                :root {
                    --primary: #6b48ff;
                    --secondary: #00ddeb;
                    --bg-light: rgba(255, 255, 255, 0.9);
                    --bg-dark: rgba(26, 26, 46, 0.9);
                    --text-light: #333;
                    --text-dark: #e0e0e0;
                }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Poppins', sans-serif;
                    background: url('https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?ixlib=rb-4.0.3&auto=format&fit=crop&w=1350&q=80') no-repeat center center fixed;
                    background-size: cover;
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    position: relative;
                }
                body::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(135deg, rgba(26, 26, 46, 0.7), rgba(22, 33, 62, 0.7));
                    z-index: -1;
                    transition: background 1s ease;
                }
                body.light::before { background: linear-gradient(135deg, rgba(107, 72, 255, 0.5), rgba(0, 221, 235, 0.5)); }
                .container {
                    background: var(--bg-dark);
                    padding: 2.5rem;
                    border-radius: 20px;
                    box-shadow: 0 15px 40px rgba(0,0,0,0.3);
                    width: 100%;
                    max-width: 500px;
                    text-align: center;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    animation: slideIn 0.8s ease;
                    color: var(--text-dark);
                }
                body.light .container { background: var(--bg-light); color: var(--text-light); }
                h1 {
                    font-size: 2.8rem;
                    font-weight: 700;
                    background: linear-gradient(to right, var(--primary), var(--secondary));
                    -webkit-background-clip: text;
                    color: transparent;
                    margin-bottom: 2rem;
                    text-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .input-group {
                    margin-bottom: 1.5rem;
                    position: relative;
                    display: flex;
                    align-items: center;
                }
                input {
                    width: 100%;
                    padding: 14px;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-radius: 10px;
                    font-size: 1.1rem;
                    background: rgba(22, 33, 62, 0.8);
                    transition: all 0.3s ease;
                    color: var(--text-dark);
                }
                body.light input { background: rgba(255, 255, 255, 0.8); border-color: rgba(255, 255, 255, 0.5); color: var(--text-light); }
                input:focus {
                    border-color: var(--primary);
                    box-shadow: 0 0 10px rgba(107, 72, 255, 0.5);
                    outline: none;
                }
                input::placeholder { color: #aaa; }
                body.light input::placeholder { color: #999; }
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
                    box-shadow: 0 5px 15px rgba(107, 72, 255, 0.4);
                }
                button:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(107, 72, 255, 0.6); }
                button:active { transform: translateY(0); box-shadow: 0 5px 15px rgba(107, 72, 255, 0.4); }
                .weather-preview {
                    background: rgba(22, 33, 62, 0.9);
                    border-radius: 10px;
                    padding: 15px;
                    margin-top: 1rem;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                    display: none;
                    animation: fadeIn 0.5s ease;
                }
                body.light .weather-preview { background: rgba(255, 255, 255, 0.9); }
                .weather-preview.active { display: block; }
                .weather-preview h3 { color: var(--primary); font-size: 1.3rem; }
                .weather-preview p { margin: 5px 0; font-size: 1rem; }
                .intro {
                    margin-top: 2rem;
                    padding: 1.5rem;
                    background: rgba(22, 33, 62, 0.8);
                    border-radius: 10px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                    animation: fadeIn 0.5s ease;
                }
                body.light .intro { background: rgba(255, 255, 255, 0.8); }
                .intro h2 { color: var(--primary); font-size: 1.5rem; margin-bottom: 1rem; }
                .footer { margin-top: 1rem; font-size: 0.9rem; color: var(--text-dark); }
                body.light .footer { color: var(--text-light); }
                .theme-toggle {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: var(--text-dark);
                    transition: all 0.3s ease;
                }
                body.light .theme-toggle { color: #fff; }
                .theme-toggle:hover { transform: rotate(20deg); }
                @keyframes slideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .suggestions {
                    position: absolute;
                    width: 100%;
                    background: rgba(22, 33, 62, 0.9);
                    border-radius: 10px;
                    box-shadow: 0 5px 20px rgba(0,0,0,0.2);
                    max-height: 200px;
                    overflow-y: auto;
                    z-index: 10;
                    top: 100%;
                    left: 0;
                    display: none;
                    transition: all 0.2s ease;
                    backdrop-filter: blur(5px);
                }
                body.light .suggestions { background: rgba(255, 255, 255, 0.9); }
                .suggestions.active { display: block; }
                .suggestion-item {
                    padding: 12px 15px;
                    cursor: pointer;
                    font-size: 1rem;
                    color: var(--text-dark);
                    transition: all 0.3s ease;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }
                body.light .suggestion-item { color: var(--text-light); border-bottom: 1px solid rgba(255, 255, 255, 0.2); }
                .suggestion-item:last-child { border-bottom: none; }
                .suggestion-item:hover {
                    background: linear-gradient(135deg, rgba(107, 72, 255, 0.2), rgba(0, 221, 235, 0.2));
                    color: var(--primary);
                }
                .suggestion-item:active { background: rgba(107, 72, 255, 0.3); }
                .location-btn {
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: var(--secondary);
                    transition: all 0.3s ease;
                    margin-left: 10px;
                }
                body.light .location-btn { color: var(--primary); }
                .location-btn:hover { color: #fff; transform: scale(1.2); }
            </style>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
            <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"></script>
            <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-database-compat.js"></script>
        </head>
        <body class="dark">
            <div class="container">
                <button class="theme-toggle" onclick="toggleTheme()"><i class="fas fa-sun"></i></button>
                <h1>Umbrella Reminder</h1>
                <div class="input-group">
                    <input type="email" id="email" placeholder="Your Email" required>
                </div>
                <div class="input-group">
                    <input type="text" id="city" placeholder="Your City" required oninput="fetchCitySuggestions()">
                    <button class="location-btn" onclick="getCurrentLocation()" title="Use my location"><i class="fas fa-map-marker-alt"></i></button>
                    <div id="citySuggestions" class="suggestions"></div>
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
                <div class="footer">
                    <p>© 2025 Chayan</p>
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
                        const city = document.getElementById('city').value.split(',')[0].trim();
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

                    let debounceTimeout;
                    window.fetchCitySuggestions = async function() {
                        clearTimeout(debounceTimeout);
                        const query = document.getElementById('city').value;
                        const suggestionsDiv = document.getElementById('citySuggestions');
                        if (query.length < 3) {
                            suggestionsDiv.innerHTML = '';
                            suggestionsDiv.classList.remove('active');
                            return;
                        }
                        debounceTimeout = setTimeout(async () => {
                            const response = await fetch(\`/cities?query=\${query}\`);
                            const cities = await response.json();
                            suggestionsDiv.innerHTML = cities.map(city => 
                                \`<div class="suggestion-item" onclick="selectCity('\${city}')">\${city}</div>\`
                            ).join('');
                            suggestionsDiv.classList.add('active');
                        }, 300);
                    };

                    window.selectCity = function(city) {
                        document.getElementById('city').value = city;
                        document.getElementById('citySuggestions').classList.remove('active');
                    };

                    window.getCurrentLocation = function() {
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(async (position) => {
                                const lat = position.coords.latitude;
                                const lon = position.coords.longitude;
                                const response = await fetch(\`/location?lat=\${lat}&lon=\${lon}\`);
                                const city = await response.json();
                                if (city && city.name) {
                                    document.getElementById('city').value = city.name;
                                    document.getElementById('citySuggestions').classList.remove('active');
                                } else {
                                    alert('Could not determine your city.');
                                }
                            }, () => {
                                alert('Geolocation permission denied or unavailable.');
                            });
                        } else {
                            alert('Geolocation is not supported by your browser.');
                        }
                    };

                    window.toggleTheme = function() {
                        document.body.classList.toggle('dark');
                        document.body.classList.toggle('light');
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

app.get('/weather', async (req, res) => {
    const city = req.query.city;
    const weather = await getWeather(city);
    if (weather) {
        res.json(weather);
    } else {
        res.status(404).json({ error: 'City not found' });
    }
});

app.get('/cities', async (req, res) => {
    const query = req.query.query;
    const cities = await getCitySuggestions(query);
    res.json(cities);
});

app.get('/location', async (req, res) => {
    const { lat, lon } = req.query;
    const city = await getCityFromCoords(lat, lon);
    if (city) {
        res.json({ name: city });
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
                    const weatherData = await getWeather(city.split(',')[0].trim());
                    if (weatherData) {
                        sendEmail(email, weatherData, city);
                    }
                }
            }
        })
        .catch((error) => {});
});

app.listen(process.env.PORT || 3000, () => {});

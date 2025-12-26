import os
import json
from urllib import parse
from http.server import BaseHTTPRequestHandler
import requests

class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        # Extraire la query string
        query = parse.urlparse(self.path).query
        params = parse.parse_qs(query)
        city = params.get("city", [None])[0]

        if not city:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error": "Missing city parameter"}')
            return

        # Clés API stockées comme variables d'environnement
        WEATHERAPI_KEY = os.environ.get("WEATHERAPI_KEY")
        OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY")

        # Vérifier les clés
        if not WEATHERAPI_KEY or not OPENWEATHER_API_KEY:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error": "API keys not set"}')
            return

        # Appel à WeatherAPI
        try:
            url_weatherapi = f"http://api.weatherapi.com/v1/forecast.json?key={WEATHERAPI_KEY}&q={city}&days=1&aqi=no&alerts=no"
            resp_weatherapi = requests.get(url_weatherapi, timeout=5)
            data_weatherapi = resp_weatherapi.json()
        except Exception as e:
            data_weatherapi = {"error": str(e)}

        # Appel à OpenWeather
        try:
            url_openweather = f"http://api.openweathermap.org/data/2.5/weather?q={city}&appid={OPENWEATHER_API_KEY}&units=metric"
            resp_openweather = requests.get(url_openweather, timeout=5)
            data_openweather = resp_openweather.json()
        except Exception as e:
            data_openweather = {"error": str(e)}

        # Construire la réponse combinée
        response_data = {
            "city": city,
            "weatherapi": data_weatherapi,
            "openweather": data_openweather
        }

        # Envoyer la réponse
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(response_data).encode("utf-8"))

import os
import requests
from functools import lru_cache

OPENWEATHER_API_KEY = os.environ["OPENWEATHER_API_KEY"]
WEATHERAPI_KEY = os.environ["WEATHERAPI_KEY"]

# Cache simple (mémoire, suffisant pour ton cas)
@lru_cache(maxsize=128)
def geocode(city: str):
    url = "http://api.openweathermap.org/geo/1.0/direct"
    params = {
        "q": city,
        "limit": 1,
        "appid": OPENWEATHER_API_KEY,
    }
    r = requests.get(url, params=params, timeout=5)
    r.raise_for_status()
    data = r.json()
    if not data:
        raise ValueError("Ville inconnue")
    return data[0]["lat"], data[0]["lon"]


def forecast_openweather(lat, lon):
    url = "https://api.openweathermap.org/data/2.5/forecast"
    params = {
        "lat": lat,
        "lon": lon,
        "units": "metric",
        "appid": OPENWEATHER_API_KEY,
    }
    r = requests.get(url, params=params, timeout=5)
    r.raise_for_status()
    data = r.json()

    # On ne garde que J+1 pour l'exemple
    d = data["list"][8]  # ~24h plus tard
    return {
        "source": "openweather",
        "temp": d["main"]["temp"],
        "description": d["weather"][0]["description"],
    }


def forecast_weatherapi(city):
    url = "http://api.weatherapi.com/v1/forecast.json"
    params = {
        "key": WEATHERAPI_KEY,
        "q": city,
        "days": 1,
        "lang": "fr",
    }
    r = requests.get(url, params=params, timeout=5)
    r.raise_for_status()
    data = r.json()

    d = data["forecast"]["forecastday"][0]["day"]
    return {
        "source": "weatherapi",
        "temp": d["avgtemp_c"],
        "description": d["condition"]["text"],
    }


def handler(request):
    city = request.args.get("city")
    if not city:
        return {
            "statusCode": 400,
            "body": {"error": "Paramètre 'city' manquant"},
        }

    try:
        lat, lon = geocode(city)
        forecasts = [
            forecast_openweather(lat, lon),
            forecast_weatherapi(city),
        ]
        return {
            "statusCode": 200,
            "body": {
                "city": city,
                "forecasts": forecasts,
            },
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "body": {"error": str(e)},
        }

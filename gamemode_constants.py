# -*- coding: utf-8 -*-
"""
LupMax RPG - Exact Gamemode Constants & Mappings (1:1 with gamemodes/LupMax.pwn)
"""
from pathlib import Path
import time

# ==============================================================================
# 1. ALL 212 SA-MP VEHICLE MODELS (400 - 611) - aVehicleNames[] from LupMax.pwn
# ==============================================================================
VEHICLE_NAMES = {
    400: "Landstalker", 401: "Bravura", 402: "Buffalo", 403: "Linerunner", 404: "Perennial",
    405: "Sentinel", 406: "Dumper", 407: "Firetruck", 408: "Trashmaster", 409: "Stretch",
    410: "Manana", 411: "Infernus", 412: "Voodoo", 413: "Pony", 414: "Mule",
    415: "Cheetah", 416: "Ambulance", 417: "Leviathan", 418: "Moonbeam", 419: "Esperanto",
    420: "Taxi", 421: "Washington", 422: "Bobcat", 423: "Mr Whoopee", 424: "BF Injection",
    425: "Hunter", 426: "Premier", 427: "Enforcer", 428: "Securicar", 429: "Banshee",
    430: "Predator", 431: "Bus", 432: "Rhino", 433: "Barracks", 434: "Hotknife",
    435: "Trailer 1", 436: "Previon", 437: "Coach", 438: "Cabbie", 439: "Stallion",
    440: "Rumpo", 441: "RC Bandit", 442: "Romero", 443: "Packer", 444: "Monster",
    445: "Admiral", 446: "Squalo", 447: "Seasparrow", 448: "Pizzaboy", 449: "Tram",
    450: "Trailer 2", 451: "Turismo", 452: "Speeder", 453: "Reefer", 454: "Tropic",
    455: "Flatbed", 456: "Yankee", 457: "Caddy", 458: "Solair", 459: "Berkley's RC Van",
    460: "Skimmer", 461: "PCJ-600", 462: "Faggio", 463: "Freeway", 464: "RC Baron",
    465: "RC Raider", 466: "Glendale", 467: "Oceanic", 468: "Sanchez", 469: "Sparrow",
    470: "Patriot", 471: "Quad", 472: "Coastguard", 473: "Dinghy", 474: "Hermes",
    475: "Sabre", 476: "Rustler", 477: "ZR-350", 478: "Walton", 479: "Regina",
    480: "Comet", 481: "BMX", 482: "Burrito", 483: "Camper", 484: "Marquis",
    485: "Baggage", 486: "Dozer", 487: "Maverick", 488: "News Chopper", 489: "Rancher",
    490: "FBI Rancher", 491: "Virgo", 492: "Greenwood", 493: "Jetmax", 494: "Hotring Racer",
    495: "Sandking", 496: "Blista Compact", 497: "Police Maverick", 498: "Boxville", 499: "Benson",
    500: "Mesa", 501: "RC Goblin", 502: "Hotring Racer A", 503: "Hotring Racer B", 504: "Bloodring Banger",
    505: "Rancher Lure", 506: "Super GT", 507: "Elegant", 508: "Journey", 509: "Bike",
    510: "Mountain Bike", 511: "Beagle", 512: "Cropduster", 513: "Stuntplane", 514: "Tanker",
    515: "Roadtrain", 516: "Nebula", 517: "Majestic", 518: "Buccaneer", 519: "Shamal",
    520: "Hydra", 521: "FCR-900", 522: "NRG-500", 523: "HPV1000", 524: "Cement Truck",
    525: "Towtruck", 526: "Fortune", 527: "Cadrona", 528: "FBI Truck", 529: "Willard",
    530: "Forklift", 531: "Tractor", 532: "Combine", 533: "Feltzer", 534: "Remington",
    535: "Slamvan", 536: "Blade", 537: "Freight", 538: "Streak", 539: "Vortex",
    540: "Vincent", 541: "Bullet", 542: "Clover", 543: "Sadler", 544: "Firetruck LA",
    545: "Hustler", 546: "Intruder", 547: "Primo", 548: "Cargobob", 549: "Tampa",
    550: "Sunrise", 551: "Merit", 552: "Utility", 553: "Nevada", 554: "Yosemite",
    555: "Windsor", 556: "Monster A", 557: "Monster B", 558: "Uranus", 559: "Jester",
    560: "Sultan", 561: "Stratum", 562: "Elegy", 563: "Raindance", 564: "RC Tiger",
    565: "Flash", 566: "Tahoma", 567: "Savanna", 568: "Bandito", 569: "Freight Flat",
    570: "Streak Carriage", 571: "Kart", 572: "Mower", 573: "Duneride", 574: "Sweeper",
    575: "Broadway", 576: "Tornado", 577: "AT-400", 578: "DFT-30", 579: "Huntley",
    580: "Stafford", 581: "BF-400", 582: "Newsvan", 583: "Tug", 584: "Trailer 3",
    585: "Emperor", 586: "Wayfarer", 587: "Euros", 588: "Hotdog", 589: "Club",
    590: "Freight Box", 591: "Trailer 4", 592: "Andromada", 593: "Dodo", 594: "RC Cam",
    595: "Launch", 596: "Police LS", 597: "Police SF", 598: "Police LV", 599: "Police Ranger",
    600: "Picador", 601: "S.W.A.T.", 602: "Alpha", 603: "Phoenix", 604: "Glendale Shit",
    605: "Sadler Shit", 606: "Luggage A", 607: "Luggage B", 608: "Stair Trailer", 609: "Boxburg",
    610: "Farm Plow", 611: "Utility Trailer"
}

# ==============================================================================
# 2. SERVER JOBS & DAILY JOB SYSTEM (gServerJobsList[] from LupMax.pwn:4207)
# ==============================================================================
SERVER_JOBS_LIST = [
    {"index": 0,  "id": 1,  "name": "Detective",          "category": "Legal",   "icon": "search"},
    {"index": 1,  "id": 4,  "name": "Drug Dealer",        "category": "Illegal", "icon": "pill"},
    {"index": 2,  "id": 5,  "name": "Pizza Boy",          "category": "Legal",   "icon": "Flame"},
    {"index": 3,  "id": 7,  "name": "Bus Driver",         "category": "Legal",   "icon": "bus"},
    {"index": 4,  "id": 8,  "name": "Mechanic",           "category": "Legal",   "icon": "wrench"},
    {"index": 5,  "id": 9,  "name": "Arms Dealer",        "category": "Illegal", "icon": "crosshair"},
    {"index": 6,  "id": 11, "name": "Security Transport", "category": "Legal",   "icon": "shield"},
    {"index": 7,  "id": 10, "name": "Garbage Man",        "category": "Legal",   "icon": "truck"},
    {"index": 8,  "id": 13, "name": "Fisherman",          "category": "Legal",   "icon": "anchor"},
    {"index": 9,  "id": 14, "name": "Trucker",            "category": "Legal",   "icon": "truck"},
    {"index": 10, "id": 6,  "name": "Farmer",             "category": "Legal",   "icon": "wheat"},
    {"index": 11, "id": 2,  "name": "Car Jacker",         "category": "Illegal", "icon": "key"},
    {"index": 12, "id": 15, "name": "Miner",              "category": "Legal",   "icon": "pickaxe"},
]

JOBS_BY_ID = {
    0: "Fără Job (Unemployed)",
    1: "Detective",
    2: "Car Jacker",
    3: "IT Worker",
    4: "Drug Dealer",
    5: "Pizza Boy",
    6: "Farmer",
    7: "Bus Driver",
    8: "Mechanic",
    9: "Arms Dealer",
    10: "Garbage Man",
    11: "Security Transport",
    13: "Fisherman",
    14: "Trucker",
    15: "Miner",
}

JOB_SKILLS_META = [
    {"key": "Rob",   "name": "Robber (Jefuitor)",        "skill_col": "RobSkill",   "times_col": "RobTimes",   "rem_col": "RobRem"},
    {"key": "Fish",  "name": "Fisherman (Pescar)",       "skill_col": "FishSkill",  "times_col": "FishTimes",  "rem_col": "FishRem"},
    {"key": "Truck", "name": "Trucker (Tirist)",         "skill_col": "TruckSkill", "times_col": "TruckTimes", "rem_col": "TruckRem"},
    {"key": "Farm",  "name": "Farmer (Fermier)",         "skill_col": "FarmSkill",  "times_col": "FarmTimes",  "rem_col": "FarmRem"},
    {"key": "Pizza", "name": "Pizza Boy (Curier Pizza)", "skill_col": "PizzaSkill", "times_col": "PizzaTimes", "rem_col": "PizzaRem"},
    {"key": "Arms",  "name": "Arms Dealer (Traficant)",  "skill_col": "ArmsSkill",  "times_col": "ArmsTimes",  "rem_col": "ArmsRem"},
    {"key": "Bus",   "name": "Bus Driver (Șofer Autobuz)","skill_col": "BusSkill",  "times_col": "BusTimes",   "rem_col": "BusRem"},
    {"key": "Bank",  "name": "Security Transport",       "skill_col": "BankSkill",  "times_col": "BankTimes",  "rem_col": "BankRem"},
    {"key": "IT",    "name": "IT Worker (Programator)",  "skill_col": "ITSkill",    "times_col": "ITTimes",    "rem_col": "ITRem"},
]

# ==============================================================================
# 3. FACTIONS METADATA (1 - 14 from factions table & LupMax.pwn)
# ==============================================================================
FACTION_META = {
    0:  {"tag": "CIVIL", "type": "Civilian",   "color": "#94a3b8", "city": "San Andreas"},
    1:  {"tag": "LSPD",  "type": "Department", "color": "#3b82f6", "city": "Los Santos"},
    2:  {"tag": "FBI",   "type": "Department", "color": "#1d4ed8", "city": "San Fierro / LS"},
    3:  {"tag": "NG",    "type": "Department", "color": "#2563eb", "city": "Area 51 / LS"},
    4:  {"tag": "VLA",   "type": "Mafia",      "color": "#06b6d4", "city": "Las Venturas / LS"},
    5:  {"tag": "GSF",   "type": "Mafia",      "color": "#10b981", "city": "Los Santos"},
    6:  {"tag": "LSV",   "type": "Mafia",      "color": "#eab308", "city": "Los Santos"},
    7:  {"tag": "GOV",   "type": "Peaceful",   "color": "#b3f856", "city": "Los Santos"},
    8:  {"tag": "LVPD",  "type": "Department", "color": "#60a5fa", "city": "Las Venturas"},
    9:  {"tag": "NR",    "type": "Peaceful",   "color": "#c084fc", "city": "Los Santos"},
    10: {"tag": "BLS",   "type": "Mafia",      "color": "#a855f7", "city": "Los Santos / LV"},
    11: {"tag": "HA",    "type": "Hitman",     "color": "#ef4444", "city": "Las Venturas"},
    12: {"tag": "SI",    "type": "Peaceful",   "color": "#34d399", "city": "Los Santos"},
    13: {"tag": "TAXI",  "type": "Peaceful",   "color": "#facc15", "city": "Los Santos"},
    14: {"tag": "MED",   "type": "Peaceful",   "color": "#f43f5e", "city": "Las Venturas"},
}

# ==============================================================================
# 4. BUSINESS TYPES (bType 1..16 in LupMax.pwn)
# ==============================================================================
BUSINESS_TYPES = {
    1:  {"name": "Bancă (Bank)",                 "icon": "landmark", "color": "#10b981"},
    2:  {"name": "Gun Shop (Armurărie)",         "icon": "crosshair","color": "#ef4444"},
    3:  {"name": "Club / Bar",                   "icon": "wine",     "color": "#a855f7"},
    4:  {"name": "Sex Shop",                     "icon": "heart",    "color": "#ec4899"},
    5:  {"name": "Casino (Four Dragons)",        "icon": "dice",     "color": "#f59e0b"},
    6:  {"name": "24/7 Supermarket",             "icon": "shopping-bag", "color": "#06b6d4"},
    7:  {"name": "Burger Shot / Fast Food",      "icon": "utensils", "color": "#f97316"},
    8:  {"name": "Sală Fitness (Gym)",           "icon": "dumbbell", "color": "#3b82f6"},
    9:  {"name": "Pizza Stack",                  "icon": "pizza",    "color": "#eab308"},
    10: {"name": "Închirieri Auto (Rent Car)",   "icon": "car",      "color": "#6366f1"},
    11: {"name": "Magazin Haine (Binco)",        "icon": "shirt",    "color": "#8b5cf6"},
    12: {"name": "Benzinărie (Gas Station)",     "icon": "fuel",     "color": "#14b8a6"},
    13: {"name": "Service Auto (Pay 'n' Spray)", "icon": "wrench",   "color": "#64748b"},
    14: {"name": "Cluckin' Bell",                "icon": "utensils", "color": "#fb923c"},
    15: {"name": "Agenție Anunțuri (CNN)",       "icon": "radio",    "color": "#38bdf8"},
    16: {"name": "Tuning Shop (Mod Shop)",       "icon": "sparkles", "color": "#ec4899"},
}

# ==============================================================================
# 5. DAILY QUESTS (GiveQuest & GiveFactionQuest in LupMax.pwn:74250-74579)
# ==============================================================================
def format_quest1(qtype, progress, target):
    qtype = int(qtype or 0)
    progress = int(progress or 0)
    target = int(target or 0)
    templates = {
        1: "Urcă până pe muntele Chiliad",
        2: f"Livrează {target} pizza la jobul Pizza Boy",
        3: f"Transportă {target} materiale la Arms Dealer",
        4: f"Vinde {target} pești la un 24/7",
        5: f"Parcurge {target} km cu un vehicul personal / Deschide cutii",
        6: f"Participă la {target} curse în Race Arena",
        7: f"Repară de {target} ori un vehicul în Pay 'n' Spray",
    }
    return templates.get(qtype, "Nicio misiune activă")

def format_quest2(qtype, progress, target):
    qtype = int(qtype or 0)
    progress = int(progress or 0)
    target = int(target or 0)
    templates = {
        1: f"Arestează {target} suspecți (Departament)",
        2: f"Oferă heal la {target} jucători (Paramedic)",
        3: f"Transportă {target} clienți cu Taxiul (Taxi LS)",
        4: f"Completează {target} contracte (Hitman Agency)",
        5: f"Omoară {target} jucători în arena Paintball",
        6: f"Elimină {target} polițiști",
        7: "Jefuiește un Business (/rob)",
        8: "Vizitează stadionul de baseball din Las Venturas",
        9: "Cumpără un gram de droguri și folosește-l (/usedrugs)",
        10: f"Vinde {target} KG de făină la Farmer",
        11: "Mergi într-un bar și îmbată-te (/buydrink)",
        12: "Colectează cele 10 checkpoint-uri la jobul Garbage Man",
    }
    return templates.get(qtype, "Nicio misiune secundară activă")

# ==============================================================================
# 6. SHOP (/shop) & VIP PACKAGES (ShowVipShop in LupMax.pwn:51153 & 59433)
# ==============================================================================
VIP_PACKAGES = [
    {"days": 7,   "pp": 35,  "title": "VIP 7 Zile",   "tier": "Trial / Casual",     "discount": "Standard",     "color": "#38bdf8"},
    {"days": 30,  "pp": 100, "title": "VIP 30 Zile",  "tier": "Standard Monthly",   "discount": "Popular",      "color": "#10b981"},
    {"days": 90,  "pp": 250, "title": "VIP 90 Zile",  "tier": "Sezonier",           "discount": "-15% Reducere","color": "#a855f7"},
    {"days": 180, "pp": 450, "title": "VIP 180 Zile", "tier": "Semestrial",         "discount": "-25% Reducere","color": "#f59e0b"},
    {"days": 365, "pp": 750, "title": "VIP 365 Zile", "tier": "Anual / Legend",     "discount": "-40% Reducere","color": "#ef4444"},
]

VIP_BENEFITS = [
    "Dobândă bancară 3x la fiecare PayDay + 0% taxe bancare",
    "+1 Respect Point adițional și +50% Paycheck bonus la PayDay",
    "+25% Bonus Salariu la toate joburile de pe server",
    "+2 Sloturi suplimentare în garaj pentru vehicule personale",
    "Cooldown înjumătățit la /getgift (scade 2 ore la fiecare PayDay)",
    "-10% Reducere la Pay 'n' Spray, alimentare Peco și reparații mecanic",
    "Acces la chat-ul global /vc, /vipcolor și 3D Text Label auriu [VIP] (/vlabel)",
    "Acces la /vipcar, Valet Recall (/valet), Auto-Nitro Refill și protecție Anti-Carjack",
]

SHOP_ITEMS = [
    {"name": "Premium Account (7–365 Zile)",          "cost_pp": 20,  "category": "Cont",      "desc": "Cont Premium cu beneficii la PayDay și dobândă mărită"},
    {"name": "VIP Account (7–365 Zile)",              "cost_pp": 35,  "category": "Cont",      "desc": "Pachet complet VIP cu +25% joburi, /vipcar, /valet și +2 sloturi"},
    {"name": "Change Nickname",                       "cost_pp": 20,  "category": "Cont",      "desc": "Schimbare nume cont direct în joc cu păstrarea progresului"},
    {"name": "Clear 10 Faction Punish (FP)",          "cost_pp": 15,  "category": "Facțiune",  "desc": "Scade 10 puncte de Faction Punish din cont"},
    {"name": "Clear 20 Faction Punish (FP)",          "cost_pp": 25,  "category": "Facțiune",  "desc": "Resetează 20 puncte de Faction Punish la 0"},
    {"name": "Clear Warns (3/3 -> 0/3)",              "cost_pp": 20,  "category": "Sancțiuni", "desc": "Șterge avertismentele (Warnings) active de pe cont"},
    {"name": "Clear Faction History",                 "cost_pp": 100, "category": "Facțiune",  "desc": "Curăță istoricul facțiunilor (faction_logs) al contului"},
    {"name": "Create Clan",                           "cost_pp": 150, "category": "Clan",      "desc": "Creează propriul clan oficial cu tag colorat, rank-uri și HQ"},
    {"name": "Buy Vehicle Slot (+1 Garaj)",           "cost_pp": 25,  "category": "Vehicule",  "desc": "Adaugă 1 slot permanent pentru vehicule personale (până la 30)"},
    {"name": "Vehicle Hidden Color",                  "cost_pp": 20,  "category": "Vehicule",  "desc": "1x Punct Hidden Color pentru vopsirea mașinilor personale"},
    {"name": "Clear Vehicle KM & Age",                "cost_pp": 20,  "category": "Vehicule",  "desc": "Resetează kilometrii și zilele unui vehicul personal"},
    {"name": "iPhone + Număr Special",                "cost_pp": 15,  "category": "Inventar",  "desc": "Telefon iPhone exclusiv în joc"},
    {"name": "MP3 Player",                            "cost_pp": 10,  "category": "Inventar",  "desc": "Acces la radio și streaming muzică pe jos"},
    {"name": "20x Fireworks (Artificii)",             "cost_pp": 5,   "category": "Inventar",  "desc": "Pachet 20 artificii ce pot fi plasate în joc"},
    {"name": "Pachet Cash $300,000",                  "cost_pp": 1,   "category": "Bani",      "desc": "Adaugă instant $300,000 cash în joc"},
    {"name": "Pachet Cash $3,000,000",                "cost_pp": 25,  "category": "Bani",      "desc": "Adaugă instant $3,000,000 cash în joc"},
    {"name": "Pachet Cash $15,000,000",               "cost_pp": 60,  "category": "Bani",      "desc": "Adaugă instant $15,000,000 cash în joc"},
    {"name": "Pachet Cash $30,000,000",               "cost_pp": 120, "category": "Bani",      "desc": "Adaugă instant $30,000,000 cash în joc"},
]

# ==============================================================================
# 7. PANEL ACTIONS & SANCTION CODES (FiveSecondsTimer in LupMax.pwn:20621-20875)
# ==============================================================================
PANEL_ACTIONS_MAP = {
    1:  {"name": "Ban Temporar",          "unit": "zile",   "min_admin": 3, "punishlog_id": 1},
    2:  {"name": "Ban Permanent",         "unit": "",       "min_admin": 4, "punishlog_id": 2},
    3:  {"name": "Admin Jail",            "unit": "minute", "min_admin": 1, "punishlog_id": 6},
    4:  {"name": "Warn",                  "unit": "",       "min_admin": 1, "punishlog_id": 5},
    5:  {"name": "Mute",                  "unit": "minute", "min_admin": 1, "punishlog_id": 7},
    6:  {"name": "Adaugă Bani ($)",       "unit": "$",      "min_admin": 6, "punishlog_id": 0},
    7:  {"name": "Adaugă Premium Points", "unit": "PP",     "min_admin": 6, "punishlog_id": 0},
    8:  {"name": "Setează Admin Level",   "unit": "level",  "min_admin": 6, "punishlog_id": 0},
    9:  {"name": "Setează Helper Level",  "unit": "level",    "min_admin": 6, "punishlog_id": 0},
    10: {"name": "Kick din Joc",          "unit": "",         "min_admin": 1, "punishlog_id": 0},
    11: {"name": "Setează Lider Facțiune","unit": "facțiune", "min_admin": 4, "punishlog_id": 0},
}

# Exact leader skins & teams from CMD:setleader in gamemodes/LupMax.pwn
LEADER_SKINS_AND_TEAMS = {
    0:  {"model": 170, "team": 3},
    1:  {"model": 304, "team": 2},
    2:  {"model": 286, "team": 2},
    3:  {"model": 273, "team": 2},
    4:  {"model": 113, "team": 5},
    5:  {"model": 270, "team": 5},
    6:  {"model": 109, "team": 5},
    7:  {"model": 147, "team": 2},
    8:  {"model": 304, "team": 2},
    9:  {"model": 147, "team": 4},
    10: {"model": 296, "team": 5},
    11: {"model": 294, "team": 11},
    12: {"model": 189, "team": 4},
    13: {"model": 228, "team": 4},
    14: {"model": 70,  "team": 4},
}

PUNISHLOG_LABELS = {
    1: {"label": "Ban Temporar",  "color": "#ef4444"},
    2: {"label": "Ban Permanent", "color": "#dc2626"},
    3: {"label": "Unban",         "color": "#10b981"},
    4: {"label": "Unwarn",        "color": "#38bdf8"},
    5: {"label": "Warn",          "color": "#f59e0b"},
    6: {"label": "Admin Jail",    "color": "#f97316"},
    7: {"label": "Mute",          "color": "#a855f7"},
}

COMPLAINT_CATEGORIES = {
    0: "Deathmatch (DM / DB)",
    1: "Limbaj / Insulte / Comportament",
    2: "Înșelătorie / Scam / Economie",
    3: "Abuz Facțiune / Membru Facțiune",
    4: "Reclamație Lider Facțiune",
    5: "Reclamație Staff (Admin / Helper)",
    6: "Cheats / Hack / Bug Abuse",
}

TICKET_CATEGORIES = {
    0: "Suport General / Întrebări Joc",
    1: "Probleme Cont / Securitate / Pierdere Bunuri",
    2: "Raportare Bug / Donații & Shop",
}

MANAGER_ROLES = [
    {"col": "ManagerLideri",        "label": "Faction & Leaders Manager", "color": "#f59e0b"},
    {"col": "ManagerLideriSupport", "label": "Leaders Support Manager",   "color": "#fbbf24"},
    {"col": "ManagerStaff",         "label": "Staff Manager",             "color": "#ef4444"},
    {"col": "ManagerDepartamente",  "label": "Departments Manager",       "color": "#3b82f6"},
    {"col": "ManagerTaxi",          "label": "Taxi Company Manager",      "color": "#eab308"},
    {"col": "ManagerInstructori",   "label": "Instructors Manager",       "color": "#10b981"},
    {"col": "ManagerMedici",        "label": "Paramedics Manager",        "color": "#f43f5e"},
    {"col": "ManagerHitman",        "label": "Hitman Agency Manager",     "color": "#dc2626"},
]

FIGHT_STYLES = {
    0: "Standard (Normal)",
    4: "Standard (Normal)",
    5: "Boxing",
    6: "Kung Fu",
    7: "Knee Head",
    15: "Grab & Kick",
    16: "Elbow",
}

# ==============================================================================
# 8. LUPMAX SIGNATURE: DAILY WHEEL PRIZES & PROFILE CUSTOMIZATION PRESETS
# ==============================================================================
LUPMAX_WHEEL_PRIZES = [
    {"key": "cash_250k",  "label": "$250,000 Cash",        "short": "$250K",      "type": "money",   "amount": 250000,  "weight": 26, "rarity": "common",    "color": "#1e2924"},
    {"key": "cash_500k",  "label": "$500,000 Cash",        "short": "$500K",      "type": "money",   "amount": 500000,  "weight": 20, "rarity": "common",    "color": "#1c222d"},
    {"key": "mats_10k",   "label": "10,000 Materiale",     "short": "10K MATS",   "type": "mats",    "amount": 10000,   "weight": 16, "rarity": "common",    "color": "#24262b"},
    {"key": "rp_3",       "label": "+3 Respect Points",    "short": "+3 RP",      "type": "respect", "amount": 3,       "weight": 14, "rarity": "rare",      "color": "#1a2838"},
    {"key": "cash_1m",    "label": "$1,000,000 Cash",      "short": "$1.0M",      "type": "money",   "amount": 1000000, "weight": 10, "rarity": "rare",      "color": "#163026"},
    {"key": "pp_15",      "label": "+15 Puncte Premium",   "short": "+15 PP",     "type": "pp",      "amount": 15,      "weight": 7,  "rarity": "epic",      "color": "#2d1f35"},
    {"key": "hidden_1",   "label": "1x Hidden Color",      "short": "HIDDEN",     "type": "hidden",  "amount": 1,       "weight": 5,  "rarity": "epic",      "color": "#3d1a24"},
    {"key": "jackpot_vip","label": "JACKPOT: +50 PP & 3z VIP", "short": "JACKPOT", "type": "jackpot", "amount": 50,     "weight": 2,  "rarity": "legendary", "color": "#8c6825"},
]

PROFILE_BANNER_PRESETS = {
    "midnight_wolf":  {"name": "LupMax Midnight",     "css": "linear-gradient(135deg, #0b132b 0%, #1d4ed8 48%, #020617 100%)"},
    "vinewood_gold":  {"name": "Vinewood Sunset Gold","css": "linear-gradient(135deg, #1c1008 0%, #b45309 45%, #f59e0b 100%)"},
    "crimson_cartel": {"name": "Crimson Cartel",      "css": "linear-gradient(135deg, #1a060d 0%, #be123c 50%, #4c0519 100%)"},
    "emerald_grove":  {"name": "Grove Street Pulse",  "css": "linear-gradient(135deg, #041b11 0%, #059669 52%, #064e3b 100%)"},
    "cyber_lv":       {"name": "Las Venturas Neon",   "css": "linear-gradient(135deg, #0f0726 0%, #7c3aed 48%, #06b6d4 100%)"},
    "arctic_stealth": {"name": "Arctic Tactical",     "css": "linear-gradient(135deg, #090d16 0%, #334155 50%, #0f172a 100%)"},
}

PROFILE_SHOWCASE_BADGES = {
    "wolf_pack":    {"label": "Alpha Wolf",       "color": "#38bdf8"},
    "street_king":  {"label": "Street Racer",     "color": "#f59e0b"},
    "mafia_boss":   {"label": "Cartel Boss",      "color": "#f43f5e"},
    "law_enforcer": {"label": "San Andreas Law",  "color": "#3b82f6"},
    "tycoon":       {"label": "Maze Tycoon",      "color": "#10b981"},
    "og_veteran":   {"label": "OG Veteran",       "color": "#a855f7"},
    "sharpshooter": {"label": "Turf Sniper",      "color": "#ec4899"},
}

def read_daily_job(project_root: Path):
    """Reads scriptfiles/dailyjob.txt written by SaveDailyJobData() in LupMax.pwn."""
    dj_file = project_root / "scriptfiles" / "dailyjob.txt"
    last_day, idx, cycle_count, mask = 0, 9, 1, (1 << 9)
    if dj_file.exists():
        try:
            parts = dj_file.read_text(encoding="utf-8", errors="ignore").strip().split()
            if len(parts) >= 4:
                last_day = int(parts[0])
                idx = int(parts[1])
                cycle_count = int(parts[2])
                mask = int(parts[3])
        except Exception:
            pass
    if not (0 <= idx < len(SERVER_JOBS_LIST)):
        idx = 9
    current = SERVER_JOBS_LIST[idx]
    completed_in_cycle = [j["name"] for j in SERVER_JOBS_LIST if (mask & (1 << j["index"]))]
    return {
        "index": idx,
        "job_id": current["id"],
        "name": current["name"],
        "category": current["category"],
        "bonus": "+10% Salariu Bonus (+25% pentru VIP)",
        "last_day": last_day,
        "cycle_count": cycle_count,
        "total_jobs": len(SERVER_JOBS_LIST),
        "history_mask": mask,
        "completed_in_cycle": completed_in_cycle,
    }

def compute_vip_status(vip_val, vip_days_col=0):
    """Decodes users.VIP matching IsPlayerVIP() & GetPlayerVIPTimeLeft() in LupMax.pwn."""
    v = int(vip_val or 0)
    now = int(time.time())
    if v == 1:
        return {"active": True, "type": "Permanent", "label": "VIP Permanent", "remaining_seconds": -1}
    if v > 1:
        if v > now:
            rem = v - now
            days = rem // 86400
            hours = (rem % 86400) // 3600
            return {
                "active": True,
                "type": "Temporary",
                "label": f"VIP Activ ({days}z {hours}h rămase)",
                "expires_at": v,
                "remaining_seconds": rem,
                "days": days,
                "hours": hours,
            }
        return {"active": False, "type": "Expired", "label": "VIP Expirat", "remaining_seconds": 0}
    if int(vip_days_col or 0) > 0:
        return {"active": True, "type": "Days", "label": f"VIP ({int(vip_days_col)} zile)", "remaining_seconds": int(vip_days_col) * 86400}
    return {"active": False, "type": "None", "label": "Fără VIP", "remaining_seconds": 0}

def decode_special_quest(sq_str):
    """Decodes SpecialQuest '0|0|1|0...' (50 objects) from users.SpecialQuest."""
    if not sq_str or not isinstance(sq_str, str):
        return {"found": 0, "total": 50, "items": [0] * 50}
    parts = [1 if p.strip() == "1" else 0 for p in sq_str.split("|") if p.strip() in ("0", "1")]
    if len(parts) < 50:
        parts.extend([0] * (50 - len(parts)))
    parts = parts[:50]
    return {"found": sum(parts), "total": 50, "items": parts}


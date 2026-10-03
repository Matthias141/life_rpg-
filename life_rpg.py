#!/usr/bin/env python3
"""
Life RPG Simulator v2
A deep text-based hybrid of BitLife + Torn-style RPG + classic RPG systems.
"""

import random
import os
import sys
from copy import deepcopy

# ====================== UTILITY ======================

def clear():
    os.system('cls' if os.name == 'nt' else 'clear')

def pause(msg="\nPress Enter to continue..."):
    input(msg)

def roll(stat_value, difficulty=50, bonus=0):
    """Skill check. Returns (success, degree, roll, chance)
    degree: 2=crit success, 1=success, 0=fail, -1=crit fail
    """
    chance = min(95, max(5, 35 + (stat_value - 10) * 3 + bonus))
    roll_val = random.randint(1, 100)
    if roll_val <= max(3, chance // 8):
        return True, 2, roll_val, chance   # critical success
    elif roll_val <= chance:
        return True, 1, roll_val, chance
    elif roll_val >= 96:
        return False, -1, roll_val, chance # critical fail
    else:
        return False, 0, roll_val, chance

def weighted_choice(options):
    total = sum(w for _, w in options)
    r = random.uniform(0, total)
    upto = 0
    for choice, weight in options:
        if upto + weight >= r:
            return choice
        upto += weight
    return options[-1][0]

def clamp(val, lo, hi):
    return max(lo, min(hi, val))

# ====================== DATA ======================

TRAITS = {
    "Athletic": {"strength": 1, "agility": 1, "health": 5},
    "Bookworm": {"intelligence": 2, "education": 5},
    "Charming": {"charisma": 2, "reputation": 5},
    "Nimble": {"agility": 2, "crime_skill": 1},
    "Lucky": {"luck": 2},
    "Street Smart": {"crime_skill": 2, "agility": 1},
    "Tough": {"strength": 1, "health": 10},
    "Ambitious": {"work_skill": 2, "intelligence": 1},
    "Empathetic": {"charisma": 1, "happiness": 5},
    "Paranoid": {"criminal_heat": -5},  # starts lower heat
    "Addictive Personality": {},  # special handling
    "Genius": {"intelligence": 3},
    "Iron Will": {"willpower": 2},
}

BACKGROUNDS = {
    "Poor": {"money": 0, "education": 5, "happiness": -5, "crime_skill": 1, "desc": "You grew up with very little."},
    "Working Class": {"money": 500, "education": 15, "desc": "Modest upbringing, hard-working parents."},
    "Middle Class": {"money": 2000, "education": 25, "happiness": 5, "desc": "Comfortable suburban life."},
    "Wealthy": {"money": 15000, "education": 35, "happiness": 10, "reputation": 10, "desc": "Privileged start in life."},
    "Criminal Family": {"money": 3000, "crime_skill": 3, "criminal_heat": 10, "street_rep": 15, "desc": "Crime was the family business."},
}

JOBS = {
    "Unemployed": {"pay": 0, "req_edu": 0, "str": 0, "int": 0, "cha": 0},
    "Retail Worker": {"pay": 22000, "req_edu": 10, "str": 0, "int": 0, "cha": 1},
    "Fast Food": {"pay": 18000, "req_edu": 5, "str": 0, "int": 0, "cha": 0},
    "Construction": {"pay": 32000, "req_edu": 10, "str": 3, "int": 0, "cha": 0},
    "Office Clerk": {"pay": 32000, "req_edu": 30, "str": 0, "int": 1, "cha": 1},
    "Technician": {"pay": 42000, "req_edu": 40, "str": 1, "int": 2, "cha": 0},
    "Sales Rep": {"pay": 38000, "req_edu": 25, "str": 0, "int": 0, "cha": 3},
    "Teacher": {"pay": 45000, "req_edu": 55, "str": 0, "int": 2, "cha": 2},
    "Nurse": {"pay": 52000, "req_edu": 55, "str": 1, "int": 2, "cha": 1},
    "Police Officer": {"pay": 48000, "req_edu": 40, "str": 2, "int": 1, "cha": 1},
    "Engineer": {"pay": 72000, "req_edu": 70, "str": 0, "int": 4, "cha": 0},
    "Lawyer": {"pay": 95000, "req_edu": 80, "str": 0, "int": 3, "cha": 3},
    "Doctor": {"pay": 130000, "req_edu": 90, "str": 0, "int": 4, "cha": 1},
    "Software Dev": {"pay": 85000, "req_edu": 65, "str": 0, "int": 4, "cha": 0},
    "Business Owner": {"pay": 60000, "req_edu": 30, "str": 0, "int": 2, "cha": 2},
    "Criminal": {"pay": 0, "req_edu": 0, "str": 1, "int": 1, "cha": 1},  # special
    "Soldier": {"pay": 35000, "req_edu": 20, "str": 2, "int": 1, "cha": 0},
    "Musician": {"pay": 25000, "req_edu": 15, "str": 0, "int": 1, "cha": 3},
    "Athlete": {"pay": 40000, "req_edu": 15, "str": 4, "int": 0, "cha": 1},
}

CRIMES = {
    "pickpocket": {"risk": 20, "reward": (50, 300), "skill": 1, "heat": 5, "req_skill": 0, "stat": "agility"},
    "shoplift": {"risk": 25, "reward": (100, 600), "skill": 1, "heat": 6, "req_skill": 0, "stat": "agility"},
    "burglary": {"risk": 45, "reward": (1200, 7000), "skill": 2, "heat": 15, "req_skill": 3, "stat": "agility"},
    "car_theft": {"risk": 50, "reward": (3000, 12000), "skill": 3, "heat": 18, "req_skill": 5, "stat": "agility"},
    "drug_deal": {"risk": 40, "reward": (800, 5000), "skill": 2, "heat": 12, "req_skill": 2, "stat": "charisma"},
    "armed_robbery": {"risk": 70, "reward": (8000, 35000), "skill": 4, "heat": 30, "req_skill": 8, "stat": "strength"},
    "fraud": {"risk": 35, "reward": (2000, 15000), "skill": 3, "heat": 20, "req_skill": 6, "stat": "intelligence"},
    "heist": {"risk": 85, "reward": (30000, 120000), "skill": 6, "heat": 45, "req_skill": 15, "stat": "intelligence"},
}

ITEMS = {
    "Knife": {"type": "weapon", "bonus": {"crime": 5, "combat": 8}, "price": 80, "desc": "Basic blade"},
    "Pistol": {"type": "weapon", "bonus": {"crime": 15, "combat": 20}, "price": 1200, "desc": "Illegal handgun"},
    "Lockpicks": {"type": "tool", "bonus": {"burglary": 15}, "price": 150, "desc": "Improves burglary odds"},
    "Laptop": {"type": "tool", "bonus": {"fraud": 12, "work": 5}, "price": 800, "desc": "Useful for fraud & work"},
    "Gym Membership": {"type": "consumable", "bonus": {}, "price": 400, "desc": "One year of training boost"},
    "Fake ID": {"type": "tool", "bonus": {"crime": 8}, "price": 300, "desc": "Helps avoid heat sometimes"},
    "Body Armor": {"type": "armor", "bonus": {"combat": 15, "health": 5}, "price": 2000, "desc": "Reduces combat damage"},
    "Sports Car": {"type": "vehicle", "bonus": {"happiness": 10, "reputation": 8}, "price": 35000, "desc": "Fast and flashy"},
    "Sedan": {"type": "vehicle", "bonus": {"happiness": 4}, "price": 12000, "desc": "Reliable transport"},
    "Apartment": {"type": "property", "bonus": {"happiness": 8, "health": 3}, "price": 0, "desc": "Rented home"},  # special
    "House": {"type": "property", "bonus": {"happiness": 15, "health": 5, "reputation": 10}, "price": 180000, "desc": "Owned home"},
}

FIRST_NAMES = {
    "Male": ["James", "Michael", "Daniel", "Chris", "Alex", "Ryan", "Kevin", "David", "Marcus", "Tyler"],
    "Female": ["Emma", "Olivia", "Sophia", "Ava", "Mia", "Charlotte", "Amelia", "Harper", "Evelyn", "Lily"],
    "Non-binary": ["Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery", "Quinn", "Sam", "Jamie", "Reese"]
}

# ====================== CHARACTER ======================

class Character:
    def __init__(self, name, gender, background):
        self.name = name
        self.gender = gender
        self.background = background
        self.age = 0
        self.alive = True
        self.cause_of_death = None

        # Core Stats
        self.strength = 8
        self.intelligence = 8
        self.charisma = 8
        self.agility = 8
        self.luck = 8
        self.willpower = 8

        # Resources
        self.health = 100
        self.happiness = 65
        self.money = 0
        self.education = 0
        self.education_level = "None"  # None, High School, Bachelor, Master, Doctorate
        self.reputation = 50          # general public
        self.street_rep = 0           # criminal underworld
        self.corporate_rep = 0        # business world
        self.criminal_heat = 0
        self.crime_skill = 0
        self.work_skill = 0
        self.combat_skill = 0

        # Status flags
        self.job = "Unemployed"
        self.job_level = 0
        self.in_prison = False
        self.prison_years_left = 0
        self.prison_faction = None
        self.gang = None
        self.military = False
        self.retired = False

        # Relationships
        self.partner = None           # dict: name, loyalty, years
        self.children = []            # list of dicts
        self.friends = []
        self.rivals = []

        # Inventory & Assets
        self.inventory = []
        self.vehicle = None
        self.property = None
        self.business = None

        # Vices & Conditions
        self.addiction = None         # "alcohol", "gambling", "drugs", None
        self.addiction_level = 0
        self.injury = None            # persistent injury
        self.stress = 0               # 0-100

        self.traits = []
        self.history = []
        self.flags = set()            # story flags

        # Apply background
        bg = BACKGROUNDS[background]
        for k, v in bg.items():
            if k != "desc" and hasattr(self, k):
                setattr(self, k, getattr(self, k) + v if isinstance(v, int) else v)

    def add_history(self, event):
        self.history.append(f"Age {self.age}: {event}")

    def has_item(self, item_name):
        return item_name in self.inventory

    def get_bonus(self, key):
        """Sum bonuses from items and traits for a given key"""
        total = 0
        for item in self.inventory:
            if item in ITEMS and key in ITEMS[item].get("bonus", {}):
                total += ITEMS[item]["bonus"][key]
        if self.vehicle and self.vehicle in ITEMS:
            total += ITEMS[self.vehicle].get("bonus", {}).get(key, 0)
        if self.property and self.property in ITEMS:
            total += ITEMS[self.property].get("bonus", {}).get(key, 0)
        return total

    def modify(self, stat, amount, reason=""):
        if not hasattr(self, stat):
            return
        old = getattr(self, stat)
        if stat in ("health", "happiness", "stress"):
            new = clamp(old + amount, 0, 100)
        elif stat in ("criminal_heat", "street_rep", "corporate_rep", "reputation"):
            new = clamp(old + amount, 0, 100)
        elif stat == "money":
            new = max(0, old + amount)
        else:
            new = max(0, old + amount)
        setattr(self, stat, new)
        change = new - old
        if change != 0 and reason:
            sign = "+" if change > 0 else ""
            print(f"  → {stat.replace('_', ' ').title()}: {sign}{change} ({reason})")

    def apply_trait_effects(self):
        for t in self.traits:
            if t in TRAITS:
                for stat, val in TRAITS[t].items():
                    if hasattr(self, stat):
                        setattr(self, stat, getattr(self, stat) + val)

    def check_death(self):
        if self.health <= 0:
            self.alive = False
            self.cause_of_death = self.injury or "poor health / injury"
            return True
        if self.age >= 95 and random.random() < 0.25 + (self.age - 95) * 0.05:
            self.alive = False
            self.cause_of_death = "old age"
            return True
        if self.stress >= 95 and random.random() < 0.15:
            self.alive = False
            self.cause_of_death = "stress-related incident"
            return True
        return False

    def effective_stat(self, stat):
        base = getattr(self, stat, 10)
        # Injury penalties
        if self.injury == "broken_leg" and stat in ("agility", "strength"):
            base -= 3
        if self.injury == "head_trauma" and stat in ("intelligence", "willpower"):
            base -= 3
        if self.addiction and self.addiction_level > 5:
            base -= 1
        return max(1, base)

    def status(self):
        print("=" * 60)
        print(f"  {self.name} | Age {self.age} | {self.gender} | {self.background}")
        print(f"  Health {self.health:3}/100   Happiness {self.happiness:3}/100   Stress {self.stress:3}/100")
        print(f"  Money: ${self.money:,}   Education: {self.education_level} ({self.education}/100)")
        print("-" * 60)
        print(f"  STR {self.strength:2}  INT {self.intelligence:2}  CHA {self.charisma:2}  "
              f"AGI {self.agility:2}  LCK {self.luck:2}  WIL {self.willpower:2}")
        print(f"  Crime Skill {self.crime_skill:2}  Work Skill {self.work_skill:2}  Combat {self.combat_skill:2}")
        print(f"  Heat {self.criminal_heat:2}  Street Rep {self.street_rep:2}  Corp Rep {self.corporate_rep:2}  Public Rep {self.reputation:2}")
        print("-" * 60)
        print(f"  Job: {self.job} (Lv {self.job_level})" + (" [RETIRED]" if self.retired else ""))
        if self.gang:
            print(f"  Gang: {self.gang}")
        if self.partner:
            print(f"  Partner: {self.partner['name']} (Loyalty {self.partner['loyalty']}, {self.partner['years']} years)")
        if self.children:
            print(f"  Children: {len(self.children)}")
        if self.vehicle:
            print(f"  Vehicle: {self.vehicle}")
        if self.property:
            print(f"  Home: {self.property}")
        if self.inventory:
            print(f"  Items: {', '.join(self.inventory)}")
        if self.addiction:
            print(f"  ⚠ Addiction: {self.addiction} (Level {self.addiction_level})")
        if self.injury:
            print(f"  ⚠ Injury: {self.injury}")
        if self.in_prison:
            print(f"  ⚠ PRISON ({self.prison_years_left} years left)" + (f" | Faction: {self.prison_faction}" if self.prison_faction else ""))
        if self.traits:
            print(f"  Traits: {', '.join(self.traits)}")
        print("=" * 60)

# ====================== GAME ======================

class Game:
    def __init__(self):
        self.char = None
        self.year = 0

    # ---------- CREATION ----------
    def create_character(self):
        clear()
        print("=" * 60)
        print("          LIFE RPG SIMULATOR v2")
        print("   BitLife × Torn × Classic RPG Hybrid")
        print("=" * 60)

        name = input("\nCharacter name: ").strip() or random.choice(FIRST_NAMES["Male"])
        print("\nGender: 1.Male  2.Female  3.Non-binary")
        g = input("Choice: ").strip()
        gender = {"1": "Male", "2": "Female", "3": "Non-binary"}.get(g, "Male")

        print("\nFamily Background:")
        for i, (bg, data) in enumerate(BACKGROUNDS.items(), 1):
            print(f"  {i}. {bg}: {data['desc']}")
        b = input("Choice (1-5): ").strip()
        bg_list = list(BACKGROUNDS.keys())
        background = bg_list[int(b)-1] if b.isdigit() and 1 <= int(b) <= 5 else "Working Class"

        self.char = Character(name, gender, background)

        print(f"\n{BACKGROUNDS[background]['desc']}")
        print("\nAllocate 15 stat points (base 8 each, max +6 per stat)")
        points = 15
        stats = ["strength", "intelligence", "charisma", "agility", "luck", "willpower"]
        for stat in stats:
            if points <= 0:
                break
            while True:
                try:
                    val = int(input(f"  {stat.capitalize()} (0-6, left {points}): ") or "0")
                    if 0 <= val <= 6 and val <= points:
                        setattr(self.char, stat, 8 + val)
                        points -= val
                        break
                except ValueError:
                    pass
        while points > 0:
            s = random.choice(stats)
            if getattr(self.char, s) < 14:
                setattr(self.char, s, getattr(self.char, s) + 1)
                points -= 1

        # Starting trait
        print("\nChoose a starting trait:")
        starter = ["Athletic", "Bookworm", "Charming", "Nimble", "Lucky", "Street Smart", "Tough", "Ambitious"]
        for i, t in enumerate(starter, 1):
            print(f"  {i}. {t}")
        tchoice = input("Choice: ").strip()
        trait = starter[int(tchoice)-1] if tchoice.isdigit() and 1 <= int(tchoice) <= len(starter) else "Lucky"
        self.char.traits.append(trait)
        self.char.apply_trait_effects()

        self.char.add_history(f"Born into a {background} family. Trait: {trait}")
        clear()
        print(f"\nWelcome to life, {self.char.name}.")
        self.char.status()
        pause()

    # ---------- CORE LOOP HELPERS ----------
    def age_up(self):
        c = self.char
        c.age += 1
        self.year += 1

        # Natural changes
        if c.age > 35 and c.age % 4 == 0:
            c.modify("health", -1, "aging")
        if c.age > 50 and c.age % 3 == 0:
            c.modify("health", -1, "aging")
        if c.age > 70:
            c.modify("health", -2, "old age")
            c.modify("agility", -1 if random.random() < 0.3 else 0)

        # Stress & happiness interplay
        if c.happiness < 25:
            c.modify("stress", 8, "misery")
            c.modify("health", -2, "depression")
        if c.stress > 70:
            c.modify("happiness", -4, "high stress")
            if random.random() < 0.1:
                c.modify("health", -5, "stress illness")

        # Addiction effects
        if c.addiction:
            c.modify("money", -random.randint(200, 800), f"{c.addiction} costs")
            c.modify("health", -random.randint(1, 4), "addiction")
            c.modify("happiness", -3 if c.addiction_level > 4 else 1)
            c.addiction_level = min(10, c.addiction_level + (1 if random.random() < 0.4 else 0))
            if c.addiction_level >= 8 and random.random() < 0.15:
                c.modify("health", -15, "overdose / severe episode")

        # Heat decay
        if c.criminal_heat > 0 and not c.in_prison:
            decay = 3 + (2 if c.has_item("Fake ID") else 0)
            c.modify("criminal_heat", -decay)

        # Partner loyalty drift
        if c.partner:
            c.partner["years"] += 1
            if random.random() < 0.1:
                c.partner["loyalty"] = clamp(c.partner["loyalty"] + random.randint(-8, 5), 0, 100)

        # Prison
        if c.in_prison:
            c.prison_years_left -= 1
            if c.prison_years_left <= 0:
                c.in_prison = False
                c.prison_faction = None
                c.add_history("Released from prison")
                print("\n*** You have been released from prison. ***")
                c.modify("happiness", 15, "freedom")
                c.modify("reputation", -10, "ex-con")
                c.modify("street_rep", 5, "survived prison")

        # Job income if employed (passive yearly)
        if c.job and c.job != "Unemployed" and c.job != "Criminal" and not c.in_prison and not c.retired:
            pass  # handled in do_work when chosen

        c.check_death()

    # ---------- CHILDHOOD (0-5) ----------
    def childhood(self):
        events = [
            ("You took your first steps early.", {"agility": 1}),
            ("You spoke your first full sentence.", {"intelligence": 1}),
            ("You made a friend at daycare.", {"charisma": 1, "happiness": 6}),
            ("You had a serious illness.", {"health": -12, "happiness": -8}),
            ("Your parents argued a lot this year.", {"happiness": -10, "stress": 8}),
            ("You received a lot of love and attention.", {"happiness": 12, "willpower": 1}),
            ("You discovered you love building things.", {"intelligence": 1, "strength": 1}),
            ("A pet joined the family.", {"happiness": 10}),
            ("You were a very difficult toddler.", {"charisma": -1, "willpower": 1}),
        ]
        event, effects = random.choice(events)
        print(f"\nAge {self.char.age}: {event}")
        for s, v in effects.items():
            self.char.modify(s, v)
        self.char.add_history(event)

    # ---------- SCHOOL (6-17) ----------
    def school_year(self):
        c = self.char
        print(f"\n--- Age {c.age} | School ---")
        c.status()

        print("\nFocus this year:")
        print("  1. Study hard")
        print("  2. Sports / Physical training")
        print("  3. Social life & popularity")
        print("  4. Cause trouble / minor crime")
        print("  5. Part-time job (age 15+)")
        print("  6. Creative pursuits (music/art)")
        print("  7. Coast / do the minimum")

        choice = input("Choice: ").strip() or "7"

        if choice == "1":
            success, deg, _, _ = roll(c.effective_stat("intelligence"), 40)
            if deg >= 1:
                gain = 2 if deg == 2 else 1
                c.modify("intelligence", gain, "studying")
                c.modify("education", 10 if deg == 2 else 7, "studying")
                c.modify("happiness", -4, "study stress")
                c.modify("stress", 5)
                print("Excellent academic year." if deg == 2 else "Solid studying.")
                c.add_history("Excelled academically" if deg == 2 else "Studied diligently")
            else:
                c.modify("education", 3)
                c.modify("happiness", -6)
                c.modify("stress", 8)
                print("You struggled despite the effort.")
                c.add_history("Academic struggles")

        elif choice == "2":
            success, deg, _, _ = roll(c.effective_stat("strength") + c.effective_stat("agility"), 45)
            if deg >= 1:
                c.modify("strength", 1)
                c.modify("agility", 1 if deg == 2 else 0)
                c.modify("health", 6)
                c.modify("happiness", 6)
                c.modify("combat_skill", 1 if random.random() < 0.4 else 0)
                print("You got stronger and more athletic.")
                c.add_history("Athletic focus")
            else:
                c.modify("health", -6, "injury")
                c.injury = random.choice([None, None, "sprained_ankle", "broken_leg"])
                if c.injury:
                    print(f"Injured: {c.injury}")
                c.add_history("Sports injury")

        elif choice == "3":
            success, deg, _, _ = roll(c.effective_stat("charisma"), 40)
            if deg >= 1:
                c.modify("charisma", 1)
                c.modify("happiness", 12 if deg == 2 else 8)
                c.modify("reputation", 5)
                if random.random() < 0.3:
                    friend = random.choice(FIRST_NAMES[c.gender])
                    c.friends.append(friend)
                    print(f"You became close friends with {friend}.")
                print("You were popular this year.")
                c.add_history("Social success")
            else:
                c.modify("happiness", -8)
                c.modify("reputation", -3)
                print("Social rejection hurt.")
                c.add_history("Social difficulties")

        elif choice == "4":
            success, deg, _, _ = roll(c.effective_stat("agility") + c.crime_skill, 50)
            if deg >= 1:
                c.modify("crime_skill", 2)
                c.modify("street_rep", 3)
                c.modify("happiness", 4)
                c.modify("education", -3)
                print("You got away with it and learned the streets.")
                c.add_history("Youthful trouble - succeeded")
            else:
                c.modify("reputation", -10)
                c.modify("happiness", -10)
                c.modify("education", -5)
                c.modify("criminal_heat", 8)
                print("Caught by teachers/police. Consequences.")
                c.add_history("Got into serious trouble at school")

        elif choice == "5" and c.age >= 15:
            pay = random.randint(2000, 5000)
            c.money += pay
            c.modify("work_skill", 1)
            c.modify("happiness", -3)
            c.modify("education", -2)
            print(f"You worked part-time and earned ${pay:,}.")
            c.add_history(f"Part-time job, earned ${pay:,}")

        elif choice == "6":
            success, deg, _, _ = roll(c.effective_stat("charisma") + c.effective_stat("intelligence"), 45)
            if deg >= 1:
                c.modify("charisma", 1)
                c.modify("happiness", 10)
                if "Creative" not in c.traits and random.random() < 0.3:
                    c.traits.append("Creative")
                    print("You unlocked the Creative trait!")
                print("Your creative side flourished.")
                c.add_history("Creative pursuits")
            else:
                c.modify("happiness", 3)
                print("You dabbled creatively.")

        else:
            c.modify("happiness", 3)
            c.modify("education", 2)
            print("An average, quiet year.")
            c.add_history("Coasted through school")

        # Graduation check
        if c.age == 17:
            if c.education >= 55:
                c.education_level = "High School"
                c.modify("education", 10)
                print("\n*** You graduated high school! ***")
                c.add_history("Graduated high school")
            else:
                print("\nYou did not graduate high school cleanly.")
                c.add_history("Left school without strong credentials")

        if random.random() < 0.4:
            self.random_school_event()

    def random_school_event(self):
        c = self.char
        pool = [
            ("You won an academic award.", {"intelligence": 1, "happiness": 10, "reputation": 6, "education": 5}),
            ("You were bullied severely.", {"happiness": -15, "health": -5, "willpower": 1}),
            ("A mentor teacher changed your outlook.", {"education": 8, "happiness": 8, "intelligence": 1}),
            ("First romantic experience.", {"happiness": 12, "charisma": 1}),
            ("Family financial crisis.", {"happiness": -10, "stress": 12, "money": -random.randint(0, 500)}),
            ("You joined a sports team championship.", {"strength": 1, "happiness": 12, "reputation": 8}),
            ("Caught in a school scandal (not your fault).", {"reputation": -8, "stress": 10}),
            ("You stood up to a bully.", {"willpower": 1, "street_rep": 3, "happiness": 6}),
            ("Experimented with alcohol/drugs.", {"happiness": 5, "health": -4}),
        ]
        if c.age >= 14:
            pool.append(("You got into a real fight.", {"combat_skill": 2, "health": -8, "street_rep": 4}))
        event, effects = random.choice(pool)
        print(f"\n⚡ Event: {event}")
        for s, v in effects.items():
            if s == "money":
                c.money = max(0, c.money + v)
                print(f"  → Money: {v:+}")
            else:
                c.modify(s, v)
        c.add_history(event)
        if "alcohol" in event.lower() or "drugs" in event.lower():
            if "Addictive Personality" in c.traits or random.random() < 0.2:
                if not c.addiction:
                    c.addiction = random.choice(["alcohol", "drugs"])
                    c.addiction_level = 1
                    print(f"  ⚠ You feel the pull of {c.addiction}...")

    # ---------- ADULT PHASE ----------
    def adult_year(self):
        c = self.char
        if c.in_prison:
            self.prison_year()
            return
        if c.retired:
            self.retired_year()
            return

        print(f"\n--- Age {c.age} ---")
        c.status()

        print("\nMajor action this year:")
        print("  1. Work / Career")
        print("  2. Crime & Underworld")
        print("  3. Train stats / Education")
        print("  4. Social & Relationships")
        print("  5. Shop / Manage assets")
        print("  6. Rest & recover (lower stress)")
        print("  7. Special actions (college, military, business, gang...)")
        if c.age >= 60:
            print("  8. Consider retirement")

        choice = input("Choice: ").strip() or "6"

        if choice == "1":
            self.do_work()
        elif choice == "2":
            self.do_crime_menu()
        elif choice == "3":
            self.do_training()
        elif choice == "4":
            self.do_social()
        elif choice == "5":
            self.do_shop()
        elif choice == "6":
            c.modify("health", 10, "rest")
            c.modify("happiness", 8, "rest")
            c.modify("stress", -15, "rest")
            if c.injury and random.random() < 0.4:
                print(f"Your {c.injury} has healed.")
                c.injury = None
            print("You focused on recovery and peace.")
            c.add_history("Rested and recovered")
        elif choice == "7":
            self.special_actions()
        elif choice == "8" and c.age >= 60:
            c.retired = True
            c.job = "Retired"
            print("You retired.")
            c.add_history("Retired from working life")
        else:
            c.modify("happiness", -2)
            c.modify("stress", 3)
            print("You drifted.")

        # Passive heat events / random
        if random.random() < 0.28:
            self.random_adult_event()

        # Addiction temptation
        if not c.addiction and random.random() < 0.06:
            if input("\nYou're offered a chance to try something risky (alcohol/gambling/drugs). Take it? (y/n): ").lower() == "y":
                c.addiction = random.choice(["alcohol", "gambling", "drugs"])
                c.addiction_level = 1
                c.modify("happiness", 8)
                print(f"You started with {c.addiction}.")
                c.add_history(f"Began {c.addiction}")

    def do_work(self):
        c = self.char
        if c.job in (None, "Unemployed"):
            self.find_job()
            return

        print(f"\nWorking as {c.job} (Level {c.job_level})...")
        jobdata = JOBS.get(c.job, JOBS["Retail Worker"])
        base = jobdata["pay"]
        # Level + skill + stat bonuses
        mult = 1 + c.job_level * 0.11 + c.work_skill * 0.015
        if jobdata.get("int", 0):
            mult += (c.effective_stat("intelligence") - 10) * 0.02 * jobdata["int"]
        if jobdata.get("str", 0):
            mult += (c.effective_stat("strength") - 10) * 0.015 * jobdata["str"]
        if jobdata.get("cha", 0):
            mult += (c.effective_stat("charisma") - 10) * 0.02 * jobdata["cha"]
        mult += c.get_bonus("work") / 100

        pay = int(base * mult)
        success, deg, _, _ = roll(c.effective_stat("intelligence") + c.work_skill // 2, 42)

        if deg >= 1:
            c.money += pay
            c.modify("work_skill", 1 if random.random() < 0.6 else 0)
            c.modify("happiness", 3)
            c.modify("stress", 4)
            c.modify("corporate_rep", 2 if c.job in ("Engineer", "Lawyer", "Doctor", "Software Dev") else 1)
            if deg == 2 or random.random() < 0.22:
                c.job_level += 1
                print(f"★ Promotion! Now level {c.job_level}.")
                c.add_history(f"Promoted to level {c.job_level} as {c.job}")
            print(f"Successful year. Earned ${pay:,}.")
            c.add_history(f"Worked as {c.job}, earned ${pay:,}")
        else:
            pay = int(pay * 0.55)
            c.money += pay
            c.modify("happiness", -6)
            c.modify("stress", 10)
            print(f"Difficult year at work. Only ${pay:,}.")
            if random.random() < 0.12:
                print("You lost your job!")
                c.job = "Unemployed"
                c.job_level = 0
                c.add_history("Lost job")
            else:
                c.add_history(f"Struggled at {c.job}")

    def find_job(self):
        c = self.char
        print("\nJob search...")
        available = []
        for name, data in JOBS.items():
            if name in ("Unemployed", "Criminal", "Business Owner"):
                continue
            if c.education >= data["req_edu"]:
                weight = 20
                if data.get("int") and c.intelligence >= 12:
                    weight += 10
                if data.get("str") and c.strength >= 12:
                    weight += 8
                if data.get("cha") and c.charisma >= 12:
                    weight += 8
                if c.corporate_rep > 30:
                    weight += 5
                available.append((name, weight))

        if not available:
            available = [("Retail Worker", 40), ("Fast Food", 30), ("Construction", 20)]

        # Higher education opens better jobs
        if c.education_level in ("Bachelor", "Master", "Doctorate"):
            available.append(("Software Dev", 25))
            available.append(("Engineer", 20))
        if c.education_level in ("Master", "Doctorate"):
            available.append(("Lawyer", 15))
            available.append(("Doctor", 10))

        job = weighted_choice(available)
        c.job = job
        c.job_level = 1
        print(f"You were hired as a {job}!")
        c.modify("happiness", 10, "new job")
        c.add_history(f"Hired as {job}")

    def do_crime_menu(self):
        c = self.char
        print("\n--- Underworld ---")
        print("  1. Commit a crime")
        print("  2. Join / Interact with gang" if not c.gang else f"  2. Gang activities ({c.gang})")
        print("  3. View street reputation & heat")
        print("  4. Back")

        ch = input("Choice: ").strip()
        if ch == "1":
            self.commit_crime()
        elif ch == "2":
            self.gang_actions()
        elif ch == "3":
            print(f"\nStreet Rep: {c.street_rep}/100 | Heat: {c.criminal_heat}/100 | Crime Skill: {c.crime_skill}")
            pause()
        else:
            return

    def commit_crime(self):
        c = self.char
        print("\nAvailable crimes:")
        unlocked = []
        for i, (key, data) in enumerate(CRIMES.items(), 1):
            if c.crime_skill >= data["req_skill"]:
                print(f"  {i}. {key.replace('_', ' ').title()} (Risk {data['risk']}%, Skill req {data['req_skill']})")
                unlocked.append(key)
            else:
                print(f"  {i}. {key.replace('_', ' ').title()} [LOCKED - need skill {data['req_skill']}]")

        if not unlocked:
            print("You don't know how to commit any crimes yet.")
            return

        try:
            idx = int(input("Choose crime number: ").strip()) - 1
            crime_key = list(CRIMES.keys())[idx]
            if crime_key not in unlocked:
                print("Locked.")
                return
        except:
            print("Invalid.")
            return

        data = CRIMES[crime_key]
        stat = c.effective_stat(data["stat"])
        bonus = c.get_bonus("crime") + c.get_bonus(crime_key) + c.crime_skill * 2 - c.criminal_heat // 4
        if c.gang:
            bonus += 8

        success, deg, rollv, chance = roll(stat, data["risk"], bonus)
        print(f"\nAttempting {crime_key.replace('_', ' ')}... (chance ~{chance}%)")

        if deg >= 1:
            money = random.randint(*data["reward"])
            if deg == 2:
                money = int(money * 1.5)
                print("★ Critical success!")
            c.money += money
            c.modify("crime_skill", data["skill"])
            c.modify("street_rep", data["skill"] + 1)
            c.modify("criminal_heat", data["heat"] // 2)
            c.modify("happiness", 6)
            print(f"Got away with ${money:,}!")
            c.add_history(f"Successful {crime_key}, +${money:,}")
            if c.has_item("Pistol") or c.has_item("Knife"):
                c.modify("combat_skill", 1 if random.random() < 0.3 else 0)
        else:
            c.modify("criminal_heat", data["heat"])
            c.modify("happiness", -12)
            c.modify("stress", 10)
            print("Failed / Caught in the act!")
            # Arrest chance
            arrest_chance = 25 + c.criminal_heat // 2 + data["risk"] // 3
            if deg == -1:
                arrest_chance += 25
            if random.randint(1, 100) <= clamp(arrest_chance, 15, 90):
                years = max(1, data["risk"] // 15 + random.randint(0, 3))
                if crime_key in ("armed_robbery", "heist"):
                    years += random.randint(1, 4)
                c.in_prison = True
                c.prison_years_left = years
                c.job = "Unemployed"
                print(f"*** ARRESTED! Sentenced to {years} years. ***")
                c.add_history(f"Arrested for {crime_key}, {years} years")
            else:
                fine = random.randint(500, 4000)
                c.money = max(0, c.money - fine)
                print(f"Escaped prison but paid ${fine:,} in fines/bribes.")
                c.add_history(f"Caught for {crime_key} but avoided prison")

    def gang_actions(self):
        c = self.char
        if not c.gang:
            if c.street_rep < 15:
                print("Your street reputation is too low to join a gang.")
                return
            print("\nGangs available:")
            print("  1. The Shadows (stealth & theft oriented)")
            print("  2. Iron Fists (violence & protection)")
            print("  3. The Syndicate (fraud, drugs, organization)")
            g = input("Join which? (1-3 or n): ").strip()
            gangs = {"1": "The Shadows", "2": "Iron Fists", "3": "The Syndicate"}
            if g in gangs:
                c.gang = gangs[g]
                c.modify("street_rep", 10)
                c.modify("criminal_heat", 5)
                print(f"You joined {c.gang}!")
                c.add_history(f"Joined gang: {c.gang}")
            return

        print(f"\n{c.gang} activities:")
        print("  1. Do a job for the gang (risk/reward)")
        print("  2. Climb ranks (requires high street rep)")
        print("  3. Leave the gang")
        ch = input("Choice: ").strip()
        if ch == "1":
            success, deg, _, _ = roll(c.effective_stat("agility") + c.crime_skill, 50, 10)
            if deg >= 1:
                pay = random.randint(3000, 15000)
                c.money += pay
                c.modify("street_rep", 4)
                c.modify("crime_skill", 2)
                c.modify("criminal_heat", 8)
                print(f"Gang job success. Earned ${pay:,}.")
                c.add_history("Successful gang job")
            else:
                c.modify("health", -10)
                c.modify("criminal_heat", 15)
                c.modify("happiness", -10)
                print("Job went bad. You got hurt.")
                if random.random() < 0.3:
                    c.in_prison = True
                    c.prison_years_left = random.randint(1, 4)
                    print("Arrested during the job!")
        elif ch == "2":
            if c.street_rep >= 40:
                c.modify("street_rep", 8)
                c.modify("charisma", 1)
                print("You rose in the ranks. More respect.")
                c.add_history("Rose in gang ranks")
            else:
                print("Need more street rep.")
        elif ch == "3":
            print("Leaving has consequences...")
            c.modify("street_rep", -15)
            c.modify("criminal_heat", 10)
            if random.random() < 0.4:
                c.modify("health", -20)
                print("They didn't let you leave cleanly.")
            c.gang = None
            c.add_history("Left the gang")

    def do_training(self):
        c = self.char
        print("\nTraining / Education:")
        print("  1. Gym (Strength + Health) - $400")
        print("  2. Study / Courses (Intelligence + Education) - $600")
        print("  3. Social practice / Networking (Charisma) - $300")
        print("  4. Agility / Parkour / Sports - $350")
        print("  5. Combat training - $500")
        print("  6. Willpower / Discipline meditation - $200")
        print("  7. Enroll in higher education (if eligible)")

        ch = input("Choice: ").strip()
        costs = {"1": 400, "2": 600, "3": 300, "4": 350, "5": 500, "6": 200}
        if ch in costs and c.money < costs[ch]:
            print("Not enough money.")
            return
        if ch in costs:
            c.money -= costs[ch]

        if ch == "1":
            gain = 2 if c.has_item("Gym Membership") else 1
            c.modify("strength", gain)
            c.modify("health", 5)
            c.modify("combat_skill", 1 if random.random() < 0.3 else 0)
            print("Solid gym year.")
        elif ch == "2":
            c.modify("intelligence", 1)
            c.modify("education", 8)
            c.modify("work_skill", 1 if random.random() < 0.4 else 0)
            print("You learned a lot.")
        elif ch == "3":
            c.modify("charisma", 1)
            c.modify("corporate_rep", 2)
            c.modify("reputation", 2)
            print("Your network grew.")
        elif ch == "4":
            c.modify("agility", 1)
            c.modify("health", 3)
            print("You became quicker.")
        elif ch == "5":
            c.modify("combat_skill", 2)
            c.modify("strength", 1 if random.random() < 0.5 else 0)
            print("Fighting skills improved.")
        elif ch == "6":
            c.modify("willpower", 1)
            c.modify("stress", -8)
            print("Mental fortitude increased.")
        elif ch == "7":
            self.pursue_education()
        else:
            print("Nothing done.")
            return
        c.modify("happiness", 4)
        c.add_history("Trained / studied")

    def pursue_education(self):
        c = self.char
        if c.education_level == "None" and c.education >= 50:
            if c.money >= 5000:
                c.money -= 5000
                c.education_level = "High School"
                c.modify("education", 15)
                print("You completed high school equivalency.")
                c.add_history("Earned high school diploma")
            else:
                print("Need $5,000.")
        elif c.education_level == "High School" and c.education >= 60:
            if c.money >= 20000:
                c.money -= 20000
                c.education_level = "Bachelor"
                c.modify("education", 20)
                c.modify("intelligence", 1)
                c.modify("corporate_rep", 10)
                print("*** Bachelor's degree earned! ***")
                c.add_history("Earned Bachelor's degree")
            else:
                print("Need $20,000 for college.")
        elif c.education_level == "Bachelor" and c.education >= 75:
            if c.money >= 35000:
                c.money -= 35000
                c.education_level = "Master"
                c.modify("education", 15)
                c.modify("intelligence", 1)
                print("*** Master's degree earned! ***")
                c.add_history("Earned Master's degree")
            else:
                print("Need $35,000.")
        elif c.education_level == "Master" and c.education >= 85:
            if c.money >= 50000:
                c.money -= 50000
                c.education_level = "Doctorate"
                c.modify("education", 10)
                c.modify("intelligence", 2)
                c.modify("corporate_rep", 15)
                print("*** Doctorate earned! ***")
                c.add_history("Earned Doctorate")
            else:
                print("Need $50,000.")
        else:
            print("You don't meet the requirements or already maxed.")

    def do_social(self):
        c = self.char
        print("\nSocial:")
        print("  1. Go out, party, meet people")
        print("  2. Relationship actions")
        print("  3. Spend time with friends / family")
        print("  4. Try to have / interact with children")
        print("  5. Resolve rivalries or make enemies")

        ch = input("Choice: ").strip()
        if ch == "1":
            success, deg, _, _ = roll(c.effective_stat("charisma"), 40)
            if deg >= 1:
                c.modify("charisma", 1 if random.random() < 0.5 else 0)
                c.modify("happiness", 12)
                c.modify("reputation", 3)
                c.modify("stress", -5)
                if random.random() < 0.25:
                    fname = random.choice(FIRST_NAMES[random.choice(["Male", "Female", "Non-binary"])])
                    c.friends.append(fname)
                    print(f"New friend: {fname}")
                print("Great social year.")
            else:
                c.modify("happiness", -5)
                c.modify("stress", 5)
                print("Awkward or lonely times.")
            c.add_history("Socializing")

        elif ch == "2":
            self.relationship_menu()
        elif ch == "3":
            c.modify("happiness", 9)
            c.modify("stress", -6)
            if c.friends and random.random() < 0.3:
                print(f"Good times with {random.choice(c.friends)}.")
            print("You invested in relationships.")
            c.add_history("Spent time with close people")
        elif ch == "4":
            if c.partner and c.partner["loyalty"] > 40 and c.age >= 20:
                if random.random() < 0.35:
                    child_name = random.choice(FIRST_NAMES[random.choice(["Male", "Female"])])
                    c.children.append({"name": child_name, "age": 0, "relation": "child"})
                    c.modify("happiness", 20)
                    c.modify("stress", 10)
                    print(f"*** You had a child: {child_name}! ***")
                    c.add_history(f"Had child: {child_name}")
                else:
                    print("No child this year.")
            elif c.children:
                print(f"You have {len(c.children)} children. You spent time with them.")
                c.modify("happiness", 8)
                for chd in c.children:
                    chd["age"] += 1
            else:
                print("Need a stable partner for children, or you have none.")
        elif ch == "5":
            if random.random() < 0.5:
                rival = random.choice(FIRST_NAMES[random.choice(["Male", "Female"])])
                c.rivals.append(rival)
                c.modify("stress", 5)
                print(f"You made an enemy: {rival}")
                c.add_history(f"Gained rival: {rival}")
            else:
                c.modify("street_rep", 3)
                print("You settled a score.")
        else:
            return

    def relationship_menu(self):
        c = self.char
        if not c.partner:
            print("\nLooking for a partner...")
            chance = 25 + (c.effective_stat("charisma") - 8) * 4 + (c.reputation - 40) // 4
            if c.money > 50000:
                chance += 10
            if random.randint(1, 100) <= clamp(chance, 8, 80):
                pname = random.choice(FIRST_NAMES[random.choice(["Male", "Female", "Non-binary"])])
                c.partner = {"name": pname, "loyalty": 60 + random.randint(-10, 20), "years": 0}
                c.modify("happiness", 18)
                print(f"You started dating {pname}!")
                c.add_history(f"Started relationship with {pname}")
            else:
                c.modify("happiness", -5)
                print("No luck this year.")
            return

        print(f"\nPartner: {c.partner['name']} | Loyalty {c.partner['loyalty']} | Years {c.partner['years']}")
        print("  1. Invest time & money (improve loyalty)")
        print("  2. Propose marriage / deepen (if high loyalty)")
        print("  3. Neglect / risk breakup")
        print("  4. Break up")
        ch = input("Choice: ").strip()
        if ch == "1":
            cost = random.randint(500, 3000)
            if c.money >= cost:
                c.money -= cost
                c.partner["loyalty"] = clamp(c.partner["loyalty"] + random.randint(8, 18), 0, 100)
                c.modify("happiness", 10)
                print(f"Spent ${cost:,}. Relationship strengthened.")
            else:
                c.partner["loyalty"] = clamp(c.partner["loyalty"] - 5, 0, 100)
                print("Couldn't afford to treat them well.")
        elif ch == "2":
            if c.partner["loyalty"] >= 70:
                c.partner["loyalty"] = clamp(c.partner["loyalty"] + 15, 0, 100)
                c.modify("happiness", 15)
                c.modify("reputation", 5)
                print("You deepened the commitment. Very happy.")
                c.add_history(f"Deepened relationship with {c.partner['name']}")
            else:
                print("Loyalty not high enough.")
        elif ch == "3":
            c.partner["loyalty"] = clamp(c.partner["loyalty"] - random.randint(10, 25), 0, 100)
            c.modify("happiness", -4)
            if c.partner["loyalty"] < 25:
                print(f"{c.partner['name']} left you!")
                c.add_history(f"Broke up with {c.partner['name']}")
                c.partner = None
                c.modify("happiness", -20)
        elif ch == "4":
            print(f"You ended it with {c.partner['name']}.")
            c.add_history(f"Broke up with {c.partner['name']}")
            c.partner = None
            c.modify("happiness", -12)

    def do_shop(self):
        c = self.char
        print("\n--- Assets & Shopping ---")
        print(f"Money: ${c.money:,}")
        print("  1. Buy item / weapon / tool")
        print("  2. Buy vehicle")
        print("  3. Housing")
        print("  4. Sell something")
        print("  5. Back")

        ch = input("Choice: ").strip()
        if ch == "1":
            print("\nItems:")
            buyable = {k: v for k, v in ITEMS.items() if v["type"] in ("weapon", "tool", "armor", "consumable") and v["price"] > 0}
            for i, (name, data) in enumerate(buyable.items(), 1):
                owned = " (owned)" if c.has_item(name) else ""
                print(f"  {i}. {name} - ${data['price']:,} | {data['desc']}{owned}")
            try:
                idx = int(input("Buy number: ").strip()) - 1
                item = list(buyable.keys())[idx]
                price = buyable[item]["price"]
                if c.money >= price and item not in c.inventory:
                    c.money -= price
                    c.inventory.append(item)
                    print(f"Bought {item}!")
                    c.add_history(f"Bought {item}")
                else:
                    print("Can't buy.")
            except:
                print("Invalid.")
        elif ch == "2":
            print("\nVehicles:")
            for name in ["Sedan", "Sports Car"]:
                data = ITEMS[name]
                owned = " (current)" if c.vehicle == name else ""
                print(f"  {name} - ${data['price']:,}{owned}")
            v = input("Buy which? (sedan/sports/n): ").strip().lower()
            if v == "sedan" and c.money >= 12000:
                c.money -= 12000
                c.vehicle = "Sedan"
                print("Bought a Sedan.")
                c.add_history("Bought Sedan")
            elif v == "sports" and c.money >= 35000:
                c.money -= 35000
                c.vehicle = "Sports Car"
                c.modify("reputation", 5)
                print("Bought a Sports Car!")
                c.add_history("Bought Sports Car")
        elif ch == "3":
            if not c.property:
                print("  1. Rent Apartment ($1,200/year, improves life)")
                print("  2. Buy House ($180,000)")
                h = input("Choice: ").strip()
                if h == "1":
                    c.property = "Apartment"
                    print("You rented an apartment. (Cost deducted yearly in background)")
                    c.add_history("Rented apartment")
                elif h == "2" and c.money >= 180000:
                    c.money -= 180000
                    c.property = "House"
                    c.modify("reputation", 10)
                    c.modify("happiness", 15)
                    print("You bought a house!")
                    c.add_history("Bought a house")
            else:
                print(f"Current home: {c.property}")
                if c.property == "Apartment":
                    c.money = max(0, c.money - 1200)
                    print("Paid $1,200 rent.")
        elif ch == "4":
            if not c.inventory:
                print("Nothing to sell.")
                return
            print("Inventory:", ", ".join(c.inventory))
            item = input("Sell which item?: ").strip()
            if item in c.inventory and item in ITEMS:
                refund = ITEMS[item]["price"] // 2
                c.money += refund
                c.inventory.remove(item)
                print(f"Sold for ${refund:,}.")
            else:
                print("Can't sell that.")

    def special_actions(self):
        c = self.char
        print("\nSpecial:")
        print("  1. Join the military (age 18-30)")
        print("  2. Start / manage a business")
        print("  3. Attempt to clear heat / lay low")
        print("  4. Seek medical treatment / rehab")
        print("  5. Back")

        ch = input("Choice: ").strip()
        if ch == "1" and 18 <= c.age <= 30 and not c.military:
            c.military = True
            c.job = "Soldier"
            c.job_level = 1
            c.modify("strength", 2)
            c.modify("combat_skill", 3)
            c.modify("willpower", 1)
            c.modify("discipline", 1) if hasattr(c, "discipline") else None
            print("You enlisted. Hard training begins.")
            c.add_history("Enlisted in the military")
            # Serve a few years passively
        elif ch == "2":
            if c.business:
                print(f"You have a business. Managing...")
                success, deg, _, _ = roll(c.effective_stat("intelligence") + c.effective_stat("charisma"), 50)
                if deg >= 1:
                    profit = random.randint(10000, 40000)
                    c.money += profit
                    c.modify("work_skill", 2)
                    c.modify("corporate_rep", 5)
                    print(f"Business profit: ${profit:,}")
                else:
                    loss = random.randint(3000, 12000)
                    c.money = max(0, c.money - loss)
                    print(f"Business lost ${loss:,}")
            else:
                if c.money >= 10000:
                    c.money -= 10000
                    c.business = "Small Business"
                    c.job = "Business Owner"
                    c.job_level = 1
                    print("You started a small business!")
                    c.add_history("Started a business")
                else:
                    print("Need $10,000 capital.")
        elif ch == "3":
            c.modify("criminal_heat", -15, "laying low")
            c.modify("happiness", -5)
            print("You kept a low profile.")
            c.add_history("Laid low to reduce heat")
        elif ch == "4":
            cost = 3000
            if c.money >= cost:
                c.money -= cost
                if c.injury:
                    print(f"Treated {c.injury}.")
                    c.injury = None
                if c.addiction and random.random() < 0.5 + c.willpower * 0.03:
                    print(f"Successfully kicked {c.addiction}!")
                    c.addiction = None
                    c.addiction_level = 0
                    c.modify("willpower", 1)
                else:
                    c.modify("health", 15)
                    c.modify("stress", -10)
                    print("Medical help received.")
                c.add_history("Sought medical / rehab help")
            else:
                print("Need $3,000.")

    def prison_year(self):
        c = self.char
        print(f"\n--- Age {c.age} | PRISON ---")
        c.status()
        print("\n  1. Keep head down (safe)")
        print("  2. Work out hard")
        print("  3. Study / read")
        print("  4. Join prison faction / gang")
        print("  5. Fight / assert dominance")
        print("  6. Attempt escape (very risky)")

        ch = input("Choice: ").strip() or "1"
        if ch == "1":
            c.modify("happiness", -10)
            c.modify("stress", 5)
            print("Quiet, soul-crushing year.")
        elif ch == "2":
            c.modify("strength", 1)
            c.modify("combat_skill", 1)
            c.modify("health", 4)
            c.modify("happiness", -6)
            print("You got harder.")
        elif ch == "3":
            c.modify("intelligence", 1)
            c.modify("education", 6)
            c.modify("happiness", -5)
            print("You educated yourself inside.")
        elif ch == "4":
            if not c.prison_faction:
                c.prison_faction = random.choice(["The Brotherhood", "Los Lobos", "The Silent"])
                c.modify("street_rep", 6)
                c.modify("crime_skill", 2)
                print(f"Joined {c.prison_faction} inside.")
            else:
                c.modify("street_rep", 3)
                c.modify("crime_skill", 1)
                print("You did work for your prison faction.")
        elif ch == "5":
            success, deg, _, _ = roll(c.effective_stat("strength") + c.combat_skill, 50)
            if deg >= 1:
                c.modify("combat_skill", 2)
                c.modify("street_rep", 5)
                c.modify("happiness", 5)
                print("You won the fight. Respect gained.")
            else:
                c.modify("health", -15)
                c.injury = random.choice(["broken_rib", "concussion", "stab_wound"])
                c.modify("happiness", -15)
                print(f"You lost. Injury: {c.injury}")
        elif ch == "6":
            chance = 8 + c.agility + c.luck - 10
            if random.randint(1, 100) <= max(3, chance):
                c.in_prison = False
                c.prison_years_left = 0
                c.modify("criminal_heat", 25)
                c.modify("street_rep", 15)
                print("*** YOU ESCAPED! ***")
                c.add_history("Escaped from prison")
            else:
                c.prison_years_left += 2
                c.modify("health", -10)
                print("Failed escape. Extra years added.")
                c.add_history("Failed prison escape")
        c.add_history("Year in prison")

    def retired_year(self):
        c = self.char
        print(f"\n--- Age {c.age} | Retirement ---")
        c.status()
        print("  1. Enjoy quiet life")
        print("  2. Spend time with family")
        print("  3. Pursue hobbies")
        print("  4. Light crime / consulting (if skilled)")
        ch = input("Choice: ").strip() or "1"
        if ch == "1":
            c.modify("happiness", 6)
            c.modify("stress", -8)
            c.modify("health", -1)
        elif ch == "2":
            c.modify("happiness", 12)
            if c.children:
                print("Warm family moments.")
        elif ch == "3":
            c.modify("happiness", 10)
            c.modify("intelligence", 1 if random.random() < 0.3 else 0)
        elif ch == "4" and c.crime_skill > 10:
            pay = random.randint(2000, 10000)
            c.money += pay
            c.modify("criminal_heat", 5)
            print(f"Side activities earned ${pay:,}.")
        c.add_history("Retired year")

    def random_adult_event(self):
        c = self.char
        events = [
            ("Distant relative left you an inheritance.", {"money": random.randint(5000, 40000), "happiness": 12}),
            ("Serious car accident.", {"health": -20, "money": -random.randint(2000, 15000), "stress": 15, "injury": "whiplash"}),
            ("You were mugged.", {"money": -random.randint(200, 2000), "health": -8, "happiness": -10}),
            ("Promoted unexpectedly or big bonus at work.", {"money": random.randint(3000, 15000), "happiness": 10, "corporate_rep": 5}),
            ("Public scandal (true or false).", {"reputation": -15, "stress": 12, "happiness": -10}),
            ("You became a local minor celebrity.", {"reputation": 12, "happiness": 10, "charisma": 1}),
            ("Economic recession hit hard.", {"money": -random.randint(3000, 12000), "stress": 10}),
            ("Found a great mentor.", {"work_skill": 2, "intelligence": 1, "happiness": 8}),
            ("Old rival caused problems.", {"stress": 12, "happiness": -8}),
            ("Health scare.", {"health": -12, "stress": 10, "happiness": -8}),
            ("Won a decent amount gambling.", {"money": random.randint(1000, 8000), "happiness": 8}),
            ("Lost money gambling.", {"money": -random.randint(1000, 6000), "happiness": -8, "stress": 6}),
            ("You were offered a bribe / shady deal.", {}),
            ("Natural disaster affected your area.", {"money": -random.randint(1000, 8000), "stress": 10, "happiness": -8}),
            ("You saved someone's life / heroic act.", {"reputation": 15, "happiness": 15, "willpower": 1}),
        ]
        event, effects = random.choice(events)
        print(f"\n⚡ Random Event: {event}")
        for s, v in effects.items():
            if s == "injury":
                c.injury = v
                print(f"  → Injury: {v}")
            elif s == "money":
                c.money = max(0, c.money + v)
                print(f"  → Money: {v:+}")
            else:
                c.modify(s, v)
        c.add_history(event)

        if "bribe" in event.lower() or "shady" in event.lower():
            if input("  Accept the shady deal? (y/n): ").lower() == "y":
                if random.random() < 0.6:
                    gain = random.randint(5000, 25000)
                    c.money += gain
                    c.modify("criminal_heat", 12)
                    c.modify("street_rep", 4)
                    print(f"  It paid off (+${gain:,}).")
                else:
                    c.modify("criminal_heat", 20)
                    c.modify("reputation", -10)
                    print("  It blew up in your face.")

    def end_game(self):
        c = self.char
        clear()
        print("=" * 60)
        print("                    LIFE COMPLETE")
        print("=" * 60)
        print(f"\n{c.name} died at age {c.age}.")
        print(f"Cause: {c.cause_of_death or 'unknown'}")
        print(f"\nFinal Net Worth: ${c.money:,}")
        print(f"Highest Position: {c.job} Level {c.job_level}")
        print(f"Education: {c.education_level}")
        print(f"Children: {len(c.children)}")
        print(f"Gang: {c.gang or 'None'}")
        print(f"Street Rep: {c.street_rep} | Corp Rep: {c.corporate_rep}")
        print(f"Traits: {', '.join(c.traits)}")
        if c.partner:
            print(f"Partner at death: {c.partner['name']}")

        # Simple legacy score
        score = (c.money // 1000) + c.education + c.street_rep + c.corporate_rep + c.reputation + len(c.children) * 20 + c.job_level * 10
        print(f"\nLegacy Score: {score}")

        print("\n--- Key Life Events (last 20) ---")
        for h in c.history[-20:]:
            print(f"  {h}")
        print("\n" + "=" * 60)
        print("Thanks for playing Life RPG Simulator v2")
        print("=" * 60)

    def run(self):
        self.create_character()
        while self.char.alive:
            clear()
            if self.char.age == 0:
                print(f"{self.char.name} enters the world...")
                self.char.add_history("Born")
            elif self.char.age <= 5:
                self.childhood()
            elif self.char.age <= 17:
                self.school_year()
            else:
                self.adult_year()

            if not self.char.alive or self.char.check_death():
                break
            self.age_up()
            if not self.char.alive:
                break
            if self.char.age > 5:
                pause()
        self.end_game()


if __name__ == "__main__":
    try:
        Game().run()
    except KeyboardInterrupt:
        print("\n\nGame stopped. Thanks for playing!")
        sys.exit(0)

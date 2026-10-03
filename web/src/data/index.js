/** Static game data — no functions, pure values. */

export const APP_VERSION = "1.0.0";
export const SAVE_VERSION = 1;

export const BACKGROUNDS = {
  "Poor": { money: 0, education: 5, happiness: -5, crime: 1 },
  "Working Class": { money: 500, education: 15 },
  "Middle Class": { money: 2000, education: 25, happiness: 5 },
  "Wealthy": { money: 15000, education: 35, happiness: 10, reputation: 10 },
  "Criminal Family": { money: 3000, crime: 3, heat: 10, street: 15 }
};

export const TRAITS = {
  "Athletic": { strength: 1, agility: 1, health: 5 },
  "Bookworm": { intelligence: 2, education: 5 },
  "Charming": { charisma: 2, reputation: 5 },
  "Nimble": { agility: 2, crime: 1 },
  "Lucky": { luck: 2 },
  "Street Smart": { crime: 2, agility: 1 },
  "Tough": { strength: 1, health: 10 },
  "Ambitious": { work: 2, intelligence: 1 }
};

export const JOBS = {
  "Unemployed": { pay: 0, req: 0 },
  "Retail Worker": { pay: 22000, req: 10 },
  "Construction": { pay: 32000, req: 10 },
  "Office Clerk": { pay: 32000, req: 30 },
  "Technician": { pay: 42000, req: 40 },
  "Sales Rep": { pay: 38000, req: 25 },
  "Teacher": { pay: 45000, req: 55 },
  "Nurse": { pay: 52000, req: 55 },
  "Police Officer": { pay: 48000, req: 40 },
  "Engineer": { pay: 72000, req: 70 },
  "Software Dev": { pay: 85000, req: 65 },
  "Lawyer": { pay: 95000, req: 80 },
  "Doctor": { pay: 130000, req: 90 },
  "Business Owner": { pay: 60000, req: 30 },
  "Soldier": { pay: 35000, req: 20 }
};

export const CRIMES = [
  { id: "pickpocket", name: "Pickpocket", risk: 20, reward: [80, 350], skill: 1, heat: 5, req: 0, stat: "agility" },
  { id: "shoplift", name: "Shoplift", risk: 25, reward: [150, 700], skill: 1, heat: 6, req: 0, stat: "agility" },
  { id: "burglary", name: "Burglary", risk: 45, reward: [1500, 8000], skill: 2, heat: 15, req: 3, stat: "agility" },
  { id: "car_theft", name: "Car Theft", risk: 50, reward: [3500, 14000], skill: 3, heat: 18, req: 5, stat: "agility" },
  { id: "drug_deal", name: "Drug Deal", risk: 40, reward: [1000, 6000], skill: 2, heat: 12, req: 2, stat: "charisma" },
  { id: "armed_robbery", name: "Armed Robbery", risk: 70, reward: [10000, 40000], skill: 4, heat: 30, req: 8, stat: "strength" },
  { id: "fraud", name: "Fraud", risk: 35, reward: [2500, 18000], skill: 3, heat: 20, req: 6, stat: "intelligence" },
  { id: "heist", name: "Major Heist", risk: 85, reward: [40000, 150000], skill: 6, heat: 45, req: 15, stat: "intelligence" }
];

export const NAMES = ["Jordan","Taylor","Morgan","Casey","Riley","Avery","Quinn","Sam","Alex","Jamie","Chris","Robin"];

export const BG_DESC = {
  "Poor": "No money, little schooling, a hard start on happiness.",
  "Working Class": "A small cushion and basic schooling. No bonuses, no penalties.",
  "Middle Class": "Steady money, solid schooling, a happier childhood.",
  "Wealthy": "Real money, strong schooling and a good name.",
  "Criminal Family": "Cash and street rep. The police already know your name."
};

export const MAX_SLOTS = 10;

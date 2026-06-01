const DEALS = [];
const PROJECTS = [];
const PRICES = [];

const DEAL_TYPES = ["Trade Control", "Trade Deal", "Investment Agreement", "Non-Investment Agreement", "Statement", "Subsidy"];
const MINERALS = ["Cobalt", "Copper", "Graphite", "Lithium", "Manganese", "Nickel", "Rare Earths", "Silicon", "General", "Others"];
const PROJECT_TYPES = ["Mine", "Refinery"];

const MINERAL_GROUPS = [
  { label: "Battery", minerals: ["Lithium", "Cobalt", "Nickel", "Graphite", "Manganese", "Copper"] },
  { label: "Wind",    minerals: ["Rare Earths", "Copper"] },
  { label: "Solar",   minerals: ["Silicon", "Copper"] },
];

const COUNTRIES = [
  "Argentina", "Australia", "Belgium", "Cambodia", "Canada", "Chile",
  "China", "DR Congo", "Egypt", "European Union", "France", "Germany",
  "Ghana", "India", "Indonesia", "Italy", "Japan", "Kazakhstan",
  "Malaysia", "Mexico", "Namibia", "Netherlands", "Nigeria", "Pakistan",
  "Saudi Arabia", "South Africa", "South Korea", "Tanzania", "Thailand",
  "Ukraine", "United Kingdom", "United States", "Zambia", "Zimbabwe",
];

const COUNTRY_NORMALIZE = {
  "People's Republic of China": "China",
  "Democratic Republic of the Congo": "DR Congo",
  "United Republic of Tanzania": "Tanzania",
  "United States of America": "United States",
  "Korea": "South Korea",
};

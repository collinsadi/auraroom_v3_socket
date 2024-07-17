const { nameModel } = require("../config/connectDB");

async function getRandomPair() {
  const Fruit = await nameModel();
  const fruits = await Fruit.find({ reserved: false }).toArray();
  const randomFruit = fruits[Math.floor(Math.random() * fruits.length)];
  return `${randomFruit}`;
}

module.exports = getRandomPair;

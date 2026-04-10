// Топ бесплатных игр Steam для группового фарма
export const FREE_GAMES = [
  { appId: 730, name: 'Counter-Strike 2' },
  { appId: 570, name: 'Dota 2' },
  { appId: 440, name: 'Team Fortress 2' },
  { appId: 578080, name: 'PUBG: BATTLEGROUNDS' },
  { appId: 1172470, name: 'Apex Legends' },
  { appId: 1938090, name: 'Call of Duty: Warzone' },
  { appId: 1517290, name: 'Battlefield 2042' },
  { appId: 1203220, name: 'NARAKA: BLADEPOINT' },
  { appId: 2357570, name: 'SpellForce: Conquest of Eo' },
  { appId: 1599340, name: 'Lost Ark' }
];

// Получить список бесплатных игр в зависимости от лимита
export function getFreeGames(limit = 10) {
  return FREE_GAMES.slice(0, limit);
}

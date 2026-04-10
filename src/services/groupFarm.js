// Топ бесплатных игр Steam для группового фарма
export const FREE_GAMES = [
  { appId: 730, name: 'Counter-Strike 2' },
  { appId: 570, name: 'Dota 2' },
  { appId: 440, name: 'Team Fortress 2' },
  { appId: 252490, name: 'Rust' },
  { appId: 578080, name: 'PUBG: BATTLEGROUNDS' },
  { appId: 1172470, name: 'Apex Legends' },
  { appId: 1938090, name: 'Call of Duty®: Warzone™' },
  { appId: 359550, name: 'Rainbow Six Siege' },
  { appId: 271590, name: 'Grand Theft Auto V' },
  { appId: 1623730, name: 'Palworld' }
];

// Получить список бесплатных игр в зависимости от лимита
export function getFreeGames(limit = 10) {
  return FREE_GAMES.slice(0, limit);
}

/*
 * Hand-checked football questions. Each row: [question, correct answer, three wrong answers,
 * category, difficulty]. Only facts that don't go out of date: avoid "latest winner" style
 * questions. Options are shuffled when a quiz is built.
 */

const ROWS = [
  // ---- World Cup ----
  ["Which country won the first FIFA World Cup in 1930?", "Uruguay", "Argentina", "Brazil", "Italy", "world-cup", "medium"],
  ["Which country hosted the 2022 FIFA World Cup?", "Qatar", "Russia", "Brazil", "Germany", "world-cup", "easy"],
  ["Which country won the 2018 World Cup?", "France", "Croatia", "Belgium", "Brazil", "world-cup", "easy"],
  ["Which country won the 2014 World Cup in Brazil?", "Germany", "Argentina", "Netherlands", "Brazil", "world-cup", "easy"],
  ["Which country won the 2010 World Cup in South Africa?", "Spain", "Netherlands", "Germany", "Uruguay", "world-cup", "easy"],
  ["Which country has won the most men's World Cups?", "Brazil", "Germany", "Italy", "Argentina", "world-cup", "easy"],
  ["Who scored the winning goal in the 2010 World Cup final?", "Andrés Iniesta", "Xavi", "David Villa", "Fernando Torres", "world-cup", "medium"],
  ["Who won the Golden Boot at the 2022 World Cup?", "Kylian Mbappé", "Lionel Messi", "Olivier Giroud", "Julián Álvarez", "world-cup", "medium"],
  ["Who won the Golden Ball (best player) at the 2022 World Cup?", "Lionel Messi", "Kylian Mbappé", "Luka Modrić", "Antoine Griezmann", "world-cup", "medium"],
  ["How was the 2022 World Cup final between Argentina and France decided?", "Penalty shootout", "Extra-time goal", "Golden goal", "Normal time", "world-cup", "easy"],
  ["Which country hosted the 2002 World Cup together with Japan?", "South Korea", "China", "Thailand", "Australia", "world-cup", "medium"],
  ["Which was the first African country to host a men's World Cup?", "South Africa", "Nigeria", "Egypt", "Morocco", "world-cup", "medium"],
  ["Which country beat Brazil 7–1 in the 2014 World Cup semi-final?", "Germany", "Argentina", "Netherlands", "France", "world-cup", "easy"],
  ["Which country won the 1966 World Cup, hosted at home?", "England", "West Germany", "Brazil", "Portugal", "world-cup", "easy"],
  ["Which player scored the 'Hand of God' goal against England in 1986?", "Diego Maradona", "Pelé", "Johan Cruyff", "Zico", "world-cup", "easy"],
  ["How many teams play in the 2026 World Cup?", "48", "32", "40", "64", "world-cup", "medium"],
  ["Which three countries co-hosted the 2026 World Cup?", "USA, Canada and Mexico", "USA, Brazil and Mexico", "Canada, Mexico and Cuba", "USA, Canada and Costa Rica", "world-cup", "medium"],

  // ---- Continental tournaments ----
  ["Which country won Euro 2016?", "Portugal", "France", "Germany", "Italy", "continental", "easy"],
  ["Which country won the delayed Euro 2020, played in 2021?", "Italy", "England", "Spain", "Denmark", "continental", "medium"],
  ["Which country won Euro 2024?", "Spain", "England", "France", "Germany", "continental", "easy"],
  ["Which country won the 2021 Copa América, beating Brazil in the final?", "Argentina", "Uruguay", "Chile", "Colombia", "continental", "medium"],
  ["Which country has won the most Africa Cup of Nations titles?", "Egypt", "Cameroon", "Ghana", "Nigeria", "continental", "medium"],
  ["Which team did Nigeria beat in the 2013 Africa Cup of Nations final?", "Burkina Faso", "Ghana", "Ivory Coast", "Mali", "continental", "medium"],
  ["Which team did Nigeria beat in the 1996 Olympic football final?", "Argentina", "Brazil", "Spain", "Ghana", "continental", "hard"],
  ["Which club has won the most CAF Champions League titles?", "Al Ahly", "Zamalek", "TP Mazembe", "Espérance de Tunis", "continental", "medium"],

  // ---- Champions League and clubs ----
  ["Which club has won the most European Cup / Champions League titles?", "Real Madrid", "AC Milan", "Liverpool", "Bayern Munich", "clubs", "easy"],
  ["Which club came back from 3–0 down at half-time to win the 2005 Champions League final?", "Liverpool", "AC Milan", "Chelsea", "Juventus", "clubs", "medium"],
  ["Which club won the first Champions League season after the 1992 rebrand?", "Marseille", "AC Milan", "Barcelona", "Juventus", "clubs", "hard"],
  ["Which club beat Bayern Munich on penalties in the 2012 Champions League final in Munich?", "Chelsea", "Barcelona", "Real Madrid", "Manchester United", "clubs", "medium"],
  ["Which club won the 2019 Champions League final against Tottenham?", "Liverpool", "Manchester City", "Barcelona", "Real Madrid", "clubs", "medium"],
  ["Which club won the Champions League in 2023, completing a treble?", "Manchester City", "Inter Milan", "Real Madrid", "Chelsea", "clubs", "easy"],
  ["Which club won the 2025 Champions League final, beating Inter Milan 5–0?", "Paris Saint-Germain", "Arsenal", "Barcelona", "Bayern Munich", "clubs", "medium"],
  ["Which two clubs share the San Siro stadium?", "AC Milan and Inter Milan", "Juventus and Torino", "Roma and Lazio", "Napoli and Fiorentina", "clubs", "medium"],
  ["Which club plays its home games at the Santiago Bernabéu?", "Real Madrid", "Barcelona", "Atlético Madrid", "Sevilla", "clubs", "easy"],
  ["Which club plays its home games at Old Trafford?", "Manchester United", "Manchester City", "Liverpool", "Everton", "clubs", "easy"],
  ["Which club plays its home games at Signal Iduna Park?", "Borussia Dortmund", "Bayern Munich", "Schalke 04", "RB Leipzig", "clubs", "medium"],
  ["Which club plays its home games at La Bombonera?", "Boca Juniors", "River Plate", "Flamengo", "Peñarol", "clubs", "medium"],
  ["Which club is nicknamed 'The Foxes'?", "Leicester City", "Newcastle United", "Everton", "West Ham United", "clubs", "easy"],
  ["Which club is nicknamed 'The Gunners'?", "Arsenal", "Chelsea", "Tottenham Hotspur", "West Ham United", "clubs", "easy"],
  ["Which club is nicknamed 'The Toffees'?", "Everton", "Burnley", "Fulham", "Brentford", "clubs", "medium"],
  ["Which club is nicknamed 'The Old Lady'?", "Juventus", "AC Milan", "Roma", "Fiorentina", "clubs", "easy"],
  ["Which club is nicknamed 'Los Blancos'?", "Real Madrid", "Atlético Madrid", "Valencia", "Sevilla", "clubs", "easy"],
  ["In which country is the Eredivisie played?", "Netherlands", "Belgium", "Germany", "Denmark", "clubs", "easy"],
  ["Which club has won the most Bundesliga titles?", "Bayern Munich", "Borussia Dortmund", "Werder Bremen", "Hamburg", "clubs", "easy"],
  ["Which club has won the most Serie A titles?", "Juventus", "Inter Milan", "AC Milan", "Roma", "clubs", "medium"],
  ["Which club has won the most La Liga titles?", "Real Madrid", "Barcelona", "Atlético Madrid", "Valencia", "clubs", "easy"],

  // ---- Premier League ----
  ["Which club went unbeaten through the whole 2003–04 Premier League season?", "Arsenal", "Chelsea", "Manchester United", "Liverpool", "premier-league", "easy"],
  ["Which club won the 2015–16 Premier League title as 5000–1 outsiders?", "Leicester City", "Tottenham Hotspur", "Everton", "West Ham United", "premier-league", "easy"],
  ["Which club won the first Premier League season in 1992–93?", "Manchester United", "Aston Villa", "Blackburn Rovers", "Arsenal", "premier-league", "medium"],
  ["Which club became the first to reach 100 points in a Premier League season?", "Manchester City", "Chelsea", "Arsenal", "Liverpool", "premier-league", "medium"],
  ["Who is the Premier League's all-time top scorer?", "Alan Shearer", "Harry Kane", "Wayne Rooney", "Andy Cole", "premier-league", "easy"],
  ["How many clubs play in the Premier League?", "20", "18", "22", "24", "premier-league", "easy"],
  ["Which manager led Arsenal for 22 years, from 1996 to 2018?", "Arsène Wenger", "Alex Ferguson", "José Mourinho", "Pep Guardiola", "premier-league", "easy"],
  ["Which manager led Manchester United for more than 26 years until 2013?", "Alex Ferguson", "David Moyes", "Louis van Gaal", "Matt Busby", "premier-league", "easy"],
  ["Who managed Leicester City to the 2015–16 title?", "Claudio Ranieri", "Roberto Mancini", "Brendan Rodgers", "Nigel Pearson", "premier-league", "medium"],
  ["Which club did Mohamed Salah join from AS Roma in 2017?", "Liverpool", "Chelsea", "Manchester City", "Arsenal", "premier-league", "easy"],

  // ---- Players and records ----
  ["Who has won the most Ballon d'Or awards?", "Lionel Messi", "Cristiano Ronaldo", "Michel Platini", "Johan Cruyff", "players", "easy"],
  ["Who won the 2024 Ballon d'Or?", "Rodri", "Vinícius Júnior", "Jude Bellingham", "Kylian Mbappé", "players", "medium"],
  ["Which club has Cristiano Ronaldo never played for?", "Barcelona", "Sporting CP", "Juventus", "Manchester United", "players", "easy"],
  ["Which club did David Beckham NOT play for?", "Arsenal", "Manchester United", "Real Madrid", "LA Galaxy", "players", "easy"],
  ["Who is Barcelona's all-time top scorer?", "Lionel Messi", "Luis Suárez", "César Rodríguez", "Samuel Eto'o", "players", "medium"],
  ["Who is Real Madrid's all-time top scorer?", "Cristiano Ronaldo", "Raúl", "Karim Benzema", "Alfredo Di Stéfano", "players", "medium"],
  ["Who is Manchester United's all-time top scorer?", "Wayne Rooney", "Bobby Charlton", "Denis Law", "Ryan Giggs", "players", "medium"],
  ["Which goalkeeper is the only one to have won the Ballon d'Or, in 1963?", "Lev Yashin", "Dino Zoff", "Gianluigi Buffon", "Iker Casillas", "players", "hard"],
  ["Who won the first Ballon d'Or in 1956?", "Stanley Matthews", "Alfredo Di Stéfano", "Raymond Kopa", "Ferenc Puskás", "players", "hard"],
  ["Which Nigerian won the 1999 African Footballer of the Year award?", "Nwankwo Kanu", "Jay-Jay Okocha", "Rashidi Yekini", "Daniel Amokachi", "players", "medium"],
  ["Which Nigerian won the CAF African Footballer of the Year award in 2023?", "Victor Osimhen", "Wilfred Ndidi", "Alex Iwobi", "Ademola Lookman", "players", "medium"],
  ["Which Nigerian won the CAF African Footballer of the Year award in 2024?", "Ademola Lookman", "Victor Osimhen", "Samuel Chukwueze", "Kelechi Iheanacho", "players", "medium"],
  ["Which player did Paris Saint-Germain sign from Barcelona in 2017 for a world-record fee?", "Neymar", "Lionel Messi", "Luis Suárez", "Ousmane Dembélé", "players", "medium"],
  ["Which player scored five goals in nine minutes for Bayern Munich against Wolfsburg in 2015?", "Robert Lewandowski", "Thomas Müller", "Mario Gómez", "Arjen Robben", "players", "hard"],
  ["Which country does Erling Haaland represent?", "Norway", "Sweden", "Denmark", "England", "players", "easy"],
  ["Which country does Sadio Mané represent?", "Senegal", "Mali", "Ivory Coast", "Cameroon", "players", "easy"],
  ["Which country does Victor Osimhen represent?", "Nigeria", "Ghana", "Cameroon", "Senegal", "players", "easy"],
  ["Which country was Lionel Messi born in?", "Argentina", "Spain", "Uruguay", "Brazil", "players", "easy"],
  ["Which manager won the 2004 Champions League with Porto?", "José Mourinho", "Carlo Ancelotti", "Pep Guardiola", "Rafael Benítez", "players", "hard"],

  // ---- Nicknames of national teams ----
  ["Which national team is nicknamed the 'Super Eagles'?", "Nigeria", "Ghana", "Cameroon", "Senegal", "national-teams", "easy"],
  ["Which national team is nicknamed the 'Indomitable Lions'?", "Cameroon", "Senegal", "Morocco", "Kenya", "national-teams", "easy"],
  ["Which national team is nicknamed the 'Black Stars'?", "Ghana", "Nigeria", "Ivory Coast", "South Africa", "national-teams", "easy"],
  ["Which national team is nicknamed the 'Elephants'?", "Ivory Coast", "Ghana", "Zambia", "Mali", "national-teams", "medium"],
  ["Which national team is nicknamed the 'Atlas Lions'?", "Morocco", "Algeria", "Tunisia", "Egypt", "national-teams", "medium"],
  ["Which national team is nicknamed the 'Pharaohs'?", "Egypt", "Sudan", "Libya", "Tunisia", "national-teams", "medium"],
  ["Which national team is nicknamed the 'Three Lions'?", "England", "Scotland", "Wales", "Netherlands", "national-teams", "easy"],
  ["Which national team is nicknamed 'La Albiceleste'?", "Argentina", "Uruguay", "Brazil", "Chile", "national-teams", "medium"],

  // ---- Rules ----
  ["What does VAR stand for?", "Video Assistant Referee", "Visual Aid Review", "Verified Action Replay", "Video Action Review", "rules", "easy"],
  ["How many players does each team have on the pitch in a standard match?", "11", "10", "12", "9", "rules", "easy"],
  ["How long is a standard football match, not counting stoppage time?", "90 minutes", "80 minutes", "100 minutes", "120 minutes", "rules", "easy"],
  ["From how far is a penalty kick taken?", "12 yards (11 metres)", "10 yards", "15 yards", "8 yards", "rules", "medium"],
  ["Which card shows a player is sent off immediately?", "Red card", "Yellow card", "Green card", "Blue card", "rules", "easy"],
  ["What is the maximum number of substitutions most top leagues now allow per team in a match?", "Five", "Three", "Seven", "Two", "rules", "medium"],
  ["Which award goes to the top scorer at a World Cup?", "Golden Boot", "Golden Ball", "Golden Glove", "Silver Boot", "rules", "easy"],
];

export const CURATED = ROWS.map(([text, correct, w1, w2, w3, category, difficulty], i) => ({
  id: `c${i}`,
  text,
  options: [correct, w1, w2, w3],
  answer: 0, // the correct option is first here; shuffleQuestion() moves it
  category,
  difficulty,
  source: "curated",
}));

/** "Name the trophy" questions. */
const TROPHIES = [
  ["Nicknamed 'Big Ears', it is lifted by the champion of Europe's top club competition. What is it?", "UEFA Champions League trophy", "UEFA Europa League trophy", "FA Cup", "Copa Libertadores", "easy"],
  ["Brazil won this trophy outright after winning their third World Cup in 1970. What is it called?", "Jules Rimet Trophy", "Henri Delaunay Trophy", "FIFA World Cup Trophy", "Ballon d'Or", "medium"],
  ["Which trophy is presented to the winner of the UEFA European Championship?", "Henri Delaunay Trophy", "Jules Rimet Trophy", "Copa América trophy", "Kirin Cup", "medium"],
  ["Which is the oldest national football cup competition in the world, first played in 1871–72?", "FA Cup", "League Cup", "Copa del Rey", "DFB-Pokal", "medium"],
  ["Which award goes to the top scorer at a World Cup?", "Golden Boot", "Golden Ball", "Golden Glove", "Fair Play Trophy", "easy"],
  ["Which award goes to the best player at a World Cup?", "Golden Ball", "Golden Boot", "Golden Glove", "Silver Ball", "easy"],
  ["Named after a Soviet goalkeeper, which trophy goes to the world's best goalkeeper at the Ballon d'Or ceremony?", "Yashin Trophy", "Kopa Trophy", "Gerd Müller Trophy", "Golden Glove", "hard"],
  ["The Ballon d'Or award for the best young player is named after which French legend?", "Raymond Kopa", "Michel Platini", "Zinedine Zidane", "Just Fontaine", "hard"],
  ["Which trophy is awarded to the winner of South America's top club competition?", "Copa Libertadores", "Copa Sudamericana", "Copa América", "Recopa Sudamericana", "easy"],
  ["Which trophy goes to the winner of Spain's national cup?", "Copa del Rey", "Coppa Italia", "Taça de Portugal", "Supercopa de España", "easy"],
  ["Which trophy goes to the winner of England's League Cup (sponsored name: Carabao Cup)?", "EFL Cup", "FA Cup", "Community Shield", "Football League Trophy", "medium"],
  ["Which one-off match opens the English season between the league champions and the FA Cup winners?", "FA Community Shield", "Charity Cup", "League Cup final", "Super Cup", "easy"],
  ["Which competition was the UEFA Europa League called before 2009?", "UEFA Cup", "Cup Winners' Cup", "Intertoto Cup", "Fairs Cup", "medium"],
  ["Which trophy goes to the champion of Africa's top club competition?", "CAF Champions League", "CAF Confederation Cup", "Africa Cup of Nations", "African Nations Championship", "medium"],
  ["Which trophy goes to the winners of the Africa Cup of Nations?", "Africa Cup of Nations trophy", "CAF Champions League trophy", "CHAN trophy", "COSAFA Cup", "easy"],
];

export const TROPHY_QUESTIONS = TROPHIES.map(([text, correct, w1, w2, w3, difficulty], i) => ({
  id: `t${i}`,
  text,
  options: [correct, w1, w2, w3],
  answer: 0,
  category: "trophy",
  difficulty,
  source: "curated",
}));

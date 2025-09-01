-- Terminal Data Seed SQL

-- Insert Token Config
INSERT INTO token_config (symbol, total_supply, initial_circulating, community_allocation_percent, team_allocation_percent, treasury_allocation_percent, initial_price, launch_method)
VALUES ('DUEL', 1000000000, 100000000, 90, 5, 5, 0.00001, 'Pump.fun');

-- Insert Roadmap Phases
INSERT INTO roadmap_phases (quarter_number, year, title)
VALUES 
(2, 2025, 'Platform Growth & Mobile Expansion'),
(3, 2025, 'DeFi Integration & Ecosystem'),
(4, 2025, 'Multi-chain Expansion');

-- Insert Roadmap Tasks
INSERT INTO roadmap_tasks (phase_id, description)
VALUES 
(1, 'Launch multi-token portfolio competitions with advanced analytics'),
(1, 'Release iOS and Android mobile applications with push notifications'),
(1, 'Implement social sharing and expanded referral program'),
(2, 'Integrate staking mechanics and LP incentive program for DUEL token'),
(2, 'Launch governance portal for community-driven development'),
(2, 'Make developer API public for third-party integrations'),
(3, 'Expand to Ethereum and Base chains with cross-chain competitions'),
(3, 'Introduce institutional trading competitions and liquidity partnerships');

-- Insert Platform Stats (using real data)
INSERT INTO platform_stats (
  user_count, 
  upcoming_contests, 
  total_prize_pool, 
  waitlist_count
)
SELECT
  (SELECT COUNT(*) FROM users),
  (SELECT COUNT(*) FROM contests WHERE status = 'pending'),
  (SELECT COALESCE(SUM(prize_pool), 0) FROM contests WHERE status IN ('pending', 'active')),
  0;

-- Insert Terminal Commands
INSERT INTO terminal_commands (command_name, command_response)
VALUES 
('help', 'Available commands: help, about, roadmap, stats, socials, whitepaper'),
('about', 'DegenDuel is a high-stakes crypto trading competition platform on Solana, where traders can compete in real-time contests using virtual portfolios.'),
('roadmap', 'Type "roadmap detailed" to see our full development roadmap with quarterly milestones'),
('stats', 'Platform statistics: View real-time stats about users, contests, and prize pools'),
('socials', 'Twitter: @DegenDuelMe | Discord: discord.gg/degenduel | Telegram: t.me/degenduel'),
('whitepaper', 'The DegenDuel whitepaper is available at https://degenduel.me/whitepaper');
import React from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import './ReputationRadarChart.css';

// `compact` (#1850, dock Reputation rail) shrinks the chart for the GM
// Command Dock's mini radar and hides the effects list below it (the dock
// renders each faction's active rank effect inline on its own row, so
// repeating the list here would be redundant at dock scale). Purely
// additive/opt-in — omitted, `compact` defaults false and every prop below
// keeps its original value, so QuestTracker's `<ReputationRadarChart
// factions={...} />` call renders pixel-identical to before.
const ReputationRadarChart = ({ factions, compact = false }) => {
  // Helper function to get current standing
  const getCurrentStanding = (faction) => {
    const rep = faction.reputation;
    return faction.ranks.find(rank => rep >= rank.min && rep <= rank.max)?.name || 'Unknown';
  };

  // Transform faction data for the radar chart
  const data = factions.map(faction => ({
    faction: faction.name,
    standing: getCurrentStanding(faction),
    reputation: faction.reputation,
    // For radar chart, we need positive values, so shift by 50
    // Center is -50, outer is 50, so we shift to 0-100 range
    value: faction.reputation + 50
  }));

  // Get all active effects
  const activeEffects = factions
    .map(faction => {
      const currentRank = faction.ranks.find(rank =>
        faction.reputation >= rank.min && faction.reputation <= rank.max
      );
      if (currentRank && currentRank.effect) {
        return {
          faction: faction.name,
          standing: currentRank.name,
          effect: currentRank.effect
        };
      }
      return null;
    })
    .filter(effect => effect !== null);

  return (
    <div className={`reputation-radar-chart${compact ? ' reputation-radar-chart--compact' : ''}`}>
      <ResponsiveContainer width="100%" height={compact ? 220 : 400}>
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis
            dataKey="faction"
            tick={{ fontSize: 12 }}
            className="radar-axis-text"
            tickFormatter={(value, index) => {
              const item = data[index];
              return `${item.faction}\n(${item.standing})`;
            }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value, name) => [`${value - 50}`, name]}
            labelFormatter={(label) => `${label}`}
          />
          <Radar
            name="Reputation"
            dataKey="value"
            stroke="#8884d8"
            fill="#8884d8"
            fillOpacity={0.3}
            strokeWidth={2}
            label={(props) => `${props.reputation}`}
          />
        </RadarChart>
      </ResponsiveContainer>

      {!compact && activeEffects.length > 0 && (
        <div className="reputation-effects">
          <h3>Active Reputation Effects</h3>
          <div className="effects-list">
            {activeEffects.map((effect, index) => (
              <div key={index} className="effect-item">
                <div className="effect-faction">
                  <strong>{effect.faction}</strong> ({effect.standing})
                </div>
                <div className="effect-description">
                  {effect.effect}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReputationRadarChart;
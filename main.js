var d3; // Minor workaround to avoid error messages in editors

const attributes = [
  "appearance",
  "mins_played",
  "goals",
  "assist",
  "pass_accurate",
  "tackle_won",
  "shot_on_target",
  "touches"
];

const attributeLabels = {
  appearance: "Appearances",
  mins_played: "Minutes Played",
  goals: "Goals",
  assist: "Assists",
  pass_accurate: "Accurate Passes",
  tackle_won: "Tackles Won",
  shot_on_target: "Shots on Target",
  touches: "Touches"
};

// Waiting until document has loaded
window.onload = () => {

  //?? means use the value on the left unless it is null or undefined
  // Loading the dataset
  fetch('data/football.json')
    .then((response) => response.json())
    .then((json) => {
      const players = json.nodes.map(player => ({
        ...player,
        appearance: player.appearance ?? 0,
        mins_played: player.mins_played ?? 0,
        goals: player.goals ?? 0,
        assist: player.assist ?? 0,
        pass_accurate: player.pass_accurate ?? 0,
        tackle_won: player.tackle_won ?? 0,
        shot_on_target: player.shot_on_target ?? 0,
        touches: player.touches ?? 0
      }));

      console.log("Number of players:", players.length);
      console.log("First player:", players[0]);

      drawParallelCoordinates(players);
    })
    .catch(error => {
      console.error("Could not load football data:", error);
    });

};

function drawParallelCoordinates(players) {
  const width = 1200;
  const height = 600;
  const margin = { top: 60, right: 50, bottom: 30, left: 50 };
  const activeBrushes = new Map();

  const xScale = d3.scalePoint()
    .domain(attributes)
    .range([margin.left, width - margin.right]);

  const yScales = {};

  attributes.forEach(attribute => {
    yScales[attribute] = d3.scaleLinear()
      .domain(d3.extent(players, player => player[attribute]))
      .nice()
      .range([height - margin.bottom, margin.top]);
  });

  const svg = d3.select("#parallel-coordinates")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("aria-label", "Parallel coordinates plot of football player statistics");

  const line = d3.line();

  svg.append("g")
    .attr("class", "player-lines")
    .selectAll("path")
    .data(players)
    .join("path")
    .attr("class", "player-line")
    .attr("d", player => line(
      attributes.map(attribute => [
        xScale(attribute),
        yScales[attribute](player[attribute])
      ])
    ))
    .append("title")
    .text(player => player.label);

  const axes = svg.append("g")
    .selectAll("g")
    .data(attributes)
    .join("g")
    .attr("class", "parallel-axis")
    .attr("transform", attribute => `translate(${xScale(attribute)},0)`)
    .each(function (attribute) {
      d3.select(this).call(d3.axisLeft(yScales[attribute]));
    });

  axes.append("text")
    .attr("class", "axis-label")
    .attr("y", margin.top - 25)
    .attr("text-anchor", "middle")
    .text(attribute => attributeLabels[attribute]);

  axes.append("g")
    .attr("class", "axis-brush")
    .each(function (attribute) {
      const brush = d3.brushY()
        .extent([
          [-12, margin.top],
          [12, height - margin.bottom]
        ])
        .on("brush end", event => brushed(event, attribute));

      d3.select(this).call(brush);
    });

  function brushed(event, attribute) {
    if (event.selection) {
      activeBrushes.set(attribute, event.selection);
    } else {
      activeBrushes.delete(attribute);
    }

    const hasActiveBrushes = activeBrushes.size > 0;

    svg.selectAll(".player-line")
      .classed("selected", player => hasActiveBrushes && isPlayerSelected(player))
      .classed("unselected", player => hasActiveBrushes && !isPlayerSelected(player));
  }

  function isPlayerSelected(player) {
    return Array.from(activeBrushes).every(([attribute, selection]) => {
      const yPosition = yScales[attribute](player[attribute]);
      return yPosition >= selection[0] && yPosition <= selection[1];
    });
  }
}

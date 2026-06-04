var d3; // Minor workaround to avoid error messages in editors

const defaultAttributes = [
  "goals",
  "assist",
  "pass_accurate",
  "tackle_won",
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

const playerSelectionEvent = "playerSelectionChanged";

// Waiting until document has loaded
window.onload = () => {
  window.addEventListener(playerSelectionEvent, updateLinkedSelection);

  //?? means use the value on the left unless it is null or undefined
  // Loading the dataset
  fetch('data/football.json')
    .then((response) => response.json())
    .then((json) => {
      const availableAttributes = Array.from(
        new Set(json.nodes.flatMap(player => Object.keys(player)))
      )
        .filter(attribute => attribute !== "id" && attribute !== "label")
        .sort((a, b) => getAttributeLabel(a).localeCompare(getAttributeLabel(b)));

      const players = json.nodes.map(player => ({
        ...player,
        ...Object.fromEntries(
          availableAttributes.map(attribute => [attribute, player[attribute] ?? 0])
        )
      }));

      console.log("Number of players:", players.length);
      console.log("First player:", players[0]);

      createAttributeControls(players, availableAttributes);
    })
    .catch(error => {
      console.error("Could not load football data:", error);
    });

};

function publishPlayerSelection(selectedIds) {
  window.dispatchEvent(new CustomEvent(playerSelectionEvent, {
    detail: {
      selectedIds: selectedIds === null ? null : Array.from(selectedIds)
    }
  }));
}

function updateLinkedSelection(event) {
  const selectedIds = event.detail.selectedIds === null
    ? null
    : new Set(event.detail.selectedIds);

  d3.selectAll(".player-line")
    .classed("selected", player => selectedIds !== null && selectedIds.has(player.id))
    .classed("unselected", player => selectedIds !== null && !selectedIds.has(player.id));

  d3.selectAll(".player-point")
    .classed("selected", player => selectedIds !== null && selectedIds.has(player.id))
    .classed("unselected", player => selectedIds !== null && !selectedIds.has(player.id));
}

function getAttributeLabel(attribute) {
  return attributeLabels[attribute] ?? attribute
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function createAttributeControls(players, availableAttributes) {
  const minimumAttributes = 2;
  const maximumAttributes = 8;
  const selectedAttributes = new Set(defaultAttributes);
  const controls = d3.select("#attribute-controls");

  const options = controls.selectAll("label")
    .data(availableAttributes)
    .join("label")
    .attr("class", "attribute-option");

  options.append("input")
    .attr("type", "checkbox")
    .attr("value", attribute => attribute)
    .property("checked", attribute => selectedAttributes.has(attribute))
    .on("change", function (event, attribute) {
      if (event.target.checked) {
        selectedAttributes.add(attribute);
      } else {
        selectedAttributes.delete(attribute);
      }

      updateVisualizations();
    });

  options.append("span")
    .text(attribute => getAttributeLabel(attribute));

  updateVisualizations();

  function updateVisualizations() {
    const attributes = availableAttributes.filter(attribute => selectedAttributes.has(attribute));
    const atMinimum = attributes.length <= minimumAttributes;
    const atMaximum = attributes.length >= maximumAttributes;

    controls.selectAll("input")
      .property("disabled", function (attribute) {
        return selectedAttributes.has(attribute) ? atMinimum : atMaximum;
      });

    d3.select("#attribute-selection-status")
      .text(`${attributes.length} attributes selected`);

    d3.select("#parallel-coordinates").selectAll("*").remove();
    d3.select("#scatterplot-matrix").selectAll("*").remove();

    drawParallelCoordinates(players, attributes);
    drawScatterplotMatrix(players, attributes);
  }
}

function drawParallelCoordinates(players, attributes) {
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
    .text(attribute => getAttributeLabel(attribute));

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

    const selectedIds = activeBrushes.size > 0
      ? new Set(players.filter(isPlayerSelected).map(player => player.id))
      : null;

    publishPlayerSelection(selectedIds);
  }

  function isPlayerSelected(player) {
    return Array.from(activeBrushes).every(([attribute, selection]) => {
      const yPosition = yScales[attribute](player[attribute]);
      return yPosition >= selection[0] && yPosition <= selection[1];
    });
  }
}

function drawScatterplotMatrix(players, attributes) {
  const cellSize = 190;
  const padding = 28;
  const margin = 35;
  const matrixSize = attributes.length * cellSize;
  const size = matrixSize + margin * 2;
  const reversedAttributes = [...attributes].reverse();
  let activeBrushCell = null;

  const scales = {};

  attributes.forEach(attribute => {
    scales[attribute] = d3.scaleLinear()
      .domain(d3.extent(players, player => player[attribute]))
      .nice()
      .range([padding, cellSize - padding]);
  });

  const cells = [];

  reversedAttributes.forEach((yAttribute, row) => {
    attributes.forEach((xAttribute, column) => {
      cells.push({ xAttribute, yAttribute, row, column });
    });
  });

  const svg = d3.select("#scatterplot-matrix")
    .append("svg")
    .attr("viewBox", `0 0 ${size} ${size}`)
    .attr("aria-label", "Scatterplot matrix of football player statistics");

  const cellGroups = svg.append("g")
    .attr("transform", `translate(${margin},${margin})`)
    .selectAll("g")
    .data(cells)
    .join("g")
    .attr("class", cell => (
      cell.xAttribute === cell.yAttribute ? "splom-cell diagonal-cell" : "splom-cell"
    ))
    .attr("transform", cell => (
      `translate(${cell.column * cellSize},${cell.row * cellSize})`
    ));

  cellGroups.append("rect")
    .attr("class", "cell-frame")
    .attr("width", cellSize)
    .attr("height", cellSize);

  const scatterCells = cellGroups.filter(cell => cell.xAttribute !== cell.yAttribute);

  scatterCells.each(function (cell) {
    const group = d3.select(this);
    const yScale = scales[cell.yAttribute].copy()
      .range([cellSize - padding, padding]);

    group.append("g")
      .attr("class", "splom-x-axis")
      .attr("transform", `translate(0,${cellSize - padding})`)
      .call(d3.axisBottom(scales[cell.xAttribute]).ticks(4));

    group.append("g")
      .attr("class", "splom-y-axis")
      .attr("transform", `translate(${padding},0)`)
      .call(d3.axisLeft(yScale).ticks(4));

    group.append("g")
      .attr("class", "scatter-points")
      .selectAll("circle")
      .data(players)
      .join("circle")
      .attr("class", "player-point")
      .attr("cx", player => scales[cell.xAttribute](player[cell.xAttribute]))
      .attr("cy", player => yScale(player[cell.yAttribute]))
      .attr("r", 2.5)
      .append("title")
      .text(player => player.label);

    const brush = d3.brush()
      .extent([
        [padding, padding],
        [cellSize - padding, cellSize - padding]
      ])
      .on("start brush end", event => brushed(event, cell, this));

    group.append("g")
      .attr("class", "splom-brush")
      .call(brush);
  });

  cellGroups.filter(cell => cell.xAttribute === cell.yAttribute)
    .append("text")
    .attr("class", "diagonal-label")
    .attr("x", cellSize / 2)
    .attr("y", cellSize / 2)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .text(cell => getAttributeLabel(cell.xAttribute));

  function brushed(event, cell, cellNode) {
    if (event.selection && activeBrushCell !== cellNode) {
      scatterCells
        .filter(function () {
          return this !== cellNode;
        })
        .select(".splom-brush")
        .call(d3.brush().move, null);

      activeBrushCell = cellNode;
    }

    if (!event.selection && activeBrushCell === cellNode) {
      activeBrushCell = null;
    }

    const selectedIds = event.selection
      ? getSelectedPlayerIds(event.selection, cell)
      : null;

    publishPlayerSelection(selectedIds);
  }

  function getSelectedPlayerIds(selection, cell) {
    const [[x0, y0], [x1, y1]] = selection;
    const yScale = scales[cell.yAttribute].copy()
      .range([cellSize - padding, padding]);

    return new Set(
      players
        .filter(player => {
          const xPosition = scales[cell.xAttribute](player[cell.xAttribute]);
          const yPosition = yScale(player[cell.yAttribute]);

          return xPosition >= x0 && xPosition <= x1
            && yPosition >= y0 && yPosition <= y1;
        })
        .map(player => player.id)
    );
  }
}

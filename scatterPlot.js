/**
 * Module pour la visualisation de nuages de points
 */

/**
 * Charge et parse un fichier JSON
 * @param {File} file - Fichier JSON à charger
 * @returns {Promise<Object>} - Données parsées
 */
export async function loadJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        resolve(json);
      } catch (error) {
        reject(new Error('Erreur de parsing JSON: ' + error.message));
      }
    };
    
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
    reader.readAsText(file);
  });
}

/**
 * Accède à une propriété imbriquée dans un objet via un chemin (ex: "openmeteo.hourly.time")
 * @param {Object} obj - Objet source
 * @param {string} path - Chemin vers la propriété (ex: "a.b.c")
 * @returns {*} - Valeur trouvée ou undefined
 */
function getNestedProperty(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Convertit les données du format {x: [...], y: [...]} vers [{x, y}, ...]
 * @param {Object} data - Données au format tableau ou objet
 * @param {Object} keyConfig - Configuration des noms de clés {xKey, yKey, labelsKey}
 * @returns {Array} - Tableau de points {x, y, label}
 */
export function normalizeData(data, keyConfig = {}) {
  const { xKey = 'x', yKey = 'y', labelsKey = 'labels' } = keyConfig;
  
  // Essayer d'accéder aux données via des chemins imbriqués
  const xData = getNestedProperty(data, xKey) || data[xKey];
  const yData = getNestedProperty(data, yKey) || data[yKey];
  const labelsData = getNestedProperty(data, labelsKey) || data[labelsKey];
  
  // Format avec tableaux utilisant les clés configurées
  if (xData && yData && Array.isArray(xData) && Array.isArray(yData)) {
    
    if (xData.length !== yData.length) {
      throw new Error(`Les tableaux ${xKey} et ${yKey} doivent avoir la même longueur`);
    }
    
    return xData.map((xVal, index) => ({
      x: xVal,
      y: yData[index],
      label: labelsData && labelsData[index] ? 
             labelsData[index] : `Point ${index + 1}`
    })).filter(point => point.x !== null && point.y !== null && 
                        !isNaN(point.y));  // x peut être une string (time), mais y doit être un nombre
  }
  
  // Format tableau d'objets [{x, y}, ...] - recherche aussi les clés configurées
  if (Array.isArray(data)) {
    // Vérifier si les données utilisent les clés configurées
    const usesConfigKeys = data.some(point => 
      point[xKey] !== undefined || point[yKey] !== undefined
    );
    
    if (usesConfigKeys) {
      return data.map((point, index) => ({
        x: point[xKey],
        y: point[yKey],
        label: point.label || `Point ${index + 1}`
      })).filter(point => point.x !== null && point.y !== null && 
                          typeof point.y === 'number' &&
                          !isNaN(point.y));
    }
    
    // Sinon vérifier le format standard {x, y}
    const hasStandardKeys = data.some(point => 
      point.x !== undefined || point.y !== undefined
    );
    
    if (hasStandardKeys) {
      return data.map((point, index) => ({
        x: point.x,
        y: point.y,
        label: point.label || `Point ${index + 1}`
      })).filter(point => point.x !== null && point.y !== null && 
                          typeof point.y === 'number' &&
                          !isNaN(point.y));
    }
  }
  
  throw new Error('Format de données non reconnu. Vérifiez que les chemins xKey et yKey sont corrects.');
}

/**
 * Calcule les limites des axes
 * @param {Array} data - Tableau de points
 * @param {Object} options - Options {yMargin: marge à ajouter en haut et en bas}
 * @returns {Object} - {minX, maxX, minY, maxY, isXDate}
 */
export function calculateAxisLimits(data, options = {}) {
  const { yMargin = 2 } = options; // Marge par défaut de 1
  
  // Vérifier si x est une date (string au format ISO)
  const isXDate = data.length > 0 && typeof data[0].x === 'string';
  
  let xValues, minX, maxX;
  
  if (isXDate) {
    // Convertir les dates en timestamps (millisecondes)
    xValues = data.map(p => new Date(p.x).getTime()).filter(x => !isNaN(x));
    minX = Math.min(...xValues);
    maxX = Math.max(...xValues);
  } else {
    xValues = data.map(p => p.x);
    minX = Math.min(...xValues);
    maxX = Math.max(...xValues);
  }
  
  const yValues = data.map(p => p.y);
  const rawMinY = Math.min(...yValues);
  const rawMaxY = Math.max(...yValues);
  
  return {
    minX,
    maxX,
    minY: rawMinY - yMargin,  // Ajouter la marge en bas
    maxY: rawMaxY + yMargin,  // Ajouter la marge en haut
    isXDate
  };
}

/**
 * Génère les barres verticales pour marquer minuit
 * @param {Object} limits - Limites calculées des axes
 * @param {Function} scaleX - Fonction de scaling X
 * @param {number} chartTop - Position Y du haut du graphique
 * @param {number} chartBottom - Position Y du bas du graphique
 * @returns {string} - Code SVG des barres verticales
 */
function generateMidnightMarkers(limits, scaleX, chartTop, chartBottom) {
  if (!limits.isXDate) return '';
  
  const markers = [];
  const startDate = new Date(limits.minX);
  const endDate = new Date(limits.maxX);
  
  // Trouver le premier minuit après le début
  const firstMidnight = new Date(startDate);
  firstMidnight.setHours(24, 0, 0, 0); // Passer au prochain minuit
  
  // Générer une barre pour chaque minuit
  let currentMidnight = new Date(firstMidnight);
  while (currentMidnight <= endDate) {
    const x = scaleX(currentMidnight.getTime());
    const day = currentMidnight.getDate().toString().padStart(2, '0');
    const month = (currentMidnight.getMonth() + 1).toString().padStart(2, '0');
    
    markers.push(`
      <line x1="${x}" y1="${chartTop}" x2="${x}" y2="${chartBottom}" stroke="#dc2626" stroke-width="2" opacity="0.6" />
      <text x="${x + 5}" y="${chartTop + 20}" font-size="11" font-weight="bold" fill="#dc2626">${day}/${month}</text>
    `);
    
    // Avancer de 24 heures
    currentMidnight.setDate(currentMidnight.getDate() + 1);
  }
  
  return markers.join('');
}

/**
 * Crée un graphique SVG à partir des données
 * @param {Array} data - Tableau de points normalisés
 * @param {Object} options - Options de configuration
 * @returns {string} - Code SVG
 */
export function createSVGChart(data, options = {}) {
  const {
    height = 600,
    margin = { top: 40, right: 40, bottom: 80, left: 60 },
    pointRadius = 12,
    pointColor = '#4f46e5',
    pixelsPerTick = 80,
    showValueInPoint = false,
    colorByValue = false,
    strokeWidth = 2,
    strokeColor = '#000000',
    // PARAMÈTRES DE LA LIGNE CONTINUE
    lineWidth = 3,           // ÉPAISSEUR DE LA LIGNE (modifiez cette valeur : 1-10)
    lineColor = '#9ca3af',   // COULEUR DE LA LIGNE (gris par défaut)
    lineBorderWidth = 1,     // ÉPAISSEUR DE LA BORDURE DE LA LIGNE (modifiez cette valeur : 0-5)
    lineBorderColor = '#000000'  // COULEUR DE LA BORDURE DE LA LIGNE (noir par défaut)
  } = options;
  
  const limits = calculateAxisLimits(data, { yMargin: 4 });  // Marge de 1°C en haut et en bas
  
  // Ajuster les limites X pour afficher complètement la dernière bande horaire
  const adjustedLimits = { ...limits };
  if (limits.isXDate) {
    // Ajouter 1 heure complète à maxX pour que la dernière bande soit complète
    adjustedLimits.maxX = limits.maxX + (60 * 60 * 1000); // +1 heure
  }
  
  const yRange = limits.maxY - limits.minY || 1;
  
  // Fonction pour obtenir la couleur selon la température
  const getColorForValue = (value) => {
    if (!colorByValue) return pointColor;
    
    // Palette de couleurs pour les températures (du froid au chaud)
    if (value < 0) return '#1e40af';
    if (value < 5) return '#3b82f6';
    if (value < 10) return '#06b6d4';
    if (value < 15) return '#10b981';
    if (value < 20) return '#fbbf24';
    if (value < 25) return '#f97316';
    return '#dc2626';
  };
  
  // Calculer le nombre de graduations nécessaires
  let numTicks;
  let width;
  
  if (limits.isXDate) {
    const startDate = new Date(limits.minX);
    const endDate = new Date(limits.maxX);
    const hoursDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60));
    numTicks = hoursDiff;
    width = margin.left + margin.right + (numTicks * pixelsPerTick);
  } else {
    numTicks = 10;
    width = 800;
  }
  
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const xRange = limits.maxX - limits.minX || 1;
  
  // Fonction pour convertir x en nombre (timestamp si c'est une date)
  const getXValue = (x) => {
    if (limits.isXDate) {
      return new Date(x).getTime();
    }
    return x;
  };
  
  // Fonction pour formater l'affichage des dates sur l'axe X
  const formatXLabel = (value) => {
    if (limits.isXDate) {
      const date = new Date(value);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      return `${day}/${month} ${hours}h`;
    }
    return value.toFixed(1);
  };
  
  // Fonctions de scaling
  const scaleX = (x) => margin.left + ((getXValue(x) - adjustedLimits.minX) / xRange) * chartWidth;
  const scaleY = (y) => height - margin.bottom - ((y - limits.minY) / yRange) * chartHeight;
  
  // Générer les bandes horaires alternées (blanc/gris)
  let hourlyBands = '';
  if (limits.isXDate) {
    const startDate = new Date(adjustedLimits.minX);
    const endDate = new Date(adjustedLimits.maxX);
    const totalHours = Math.ceil((endDate - startDate) / (1000 * 60 * 60));
    
    for (let i = 0; i < totalHours; i++) {
      const hourDate = new Date(startDate.getTime() + i * 60 * 60 * 1000);
      const nextHourDate = new Date(startDate.getTime() + (i + 1) * 60 * 60 * 1000);
      
      const x1 = scaleX(hourDate.getTime());
      const x2 = scaleX(nextHourDate.getTime());
      const bandWidth = x2 - x1;
      
      const bgColor = i % 2 === 0 ? '#ffffff' : '#f3f4f6';
      const hour = hourDate.getHours();
      
      hourlyBands += `
      <rect x="${x1}" y="${margin.top}" width="${bandWidth}" height="${chartHeight}" fill="${bgColor}" opacity="1" />
      <text x="${x1 + bandWidth / 2}" y="${margin.top + 15}" text-anchor="middle" font-size="11" font-weight="bold" fill="#666">${hour.toString().padStart(2, '0')}h</text>`;
    }
  }
  
  // Centrer les points de données au milieu de leur bande horaire (ajouter 30 minutes)
  const centeredData = data.map(point => {
    if (limits.isXDate && typeof point.x === 'string') {
      const timestamp = new Date(point.x).getTime();
      const centeredTimestamp = timestamp + (30 * 60 * 1000); // +30 minutes
      return {
        ...point,
        x: new Date(centeredTimestamp).toISOString()
      };
    }
    return point;
  });
  
  // Générer les marqueurs de minuit
  const midnightMarkers = generateMidnightMarkers(
    limits, 
    scaleX, 
    margin.top, 
    height - margin.bottom
  );
  
  // Génération des points avec valeurs et couleurs
  const points = centeredData.map(point => {
    const cx = scaleX(point.x);
    const cy = scaleY(point.y);
    const displayX = limits.isXDate ? point.x : point.x.toFixed(2);
    const color = getColorForValue(point.y);
    const roundedValue = Math.round(point.y);
    
    let pointSVG = `<circle cx="${cx}" cy="${cy}" r="${pointRadius}" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.9">
      <title>${point.label}: (${displayX}, ${point.y})</title>
    </circle>`;
    
    if (showValueInPoint) {
      pointSVG += `
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" 
          font-size="10" font-weight="bold" fill="white" pointer-events="none">${roundedValue}</text>`;
    }
    
    return pointSVG;
  }).join('\n    ');
  
  // Générer la ligne continue qui relie les points
  let connectingLine = '';
  if (centeredData.length > 1) {
    const linePoints = centeredData.map(point => {
      const cx = scaleX(point.x);
      const cy = scaleY(point.y);
      return `${cx},${cy}`;
    }).join(' ');
    
    // Bordure noire de la ligne (plus épaisse)
    if (lineBorderWidth > 0) {
      connectingLine += `
    <polyline points="${linePoints}" fill="none" stroke="${lineBorderColor}" stroke-width="${lineWidth + (lineBorderWidth * 2)}" stroke-linejoin="round" stroke-linecap="round" />`;
    }
    
    // Ligne principale (grise)
    connectingLine += `
    <polyline points="${linePoints}" fill="none" stroke="${lineColor}" stroke-width="${lineWidth}" stroke-linejoin="round" stroke-linecap="round" />`;
  }
  
  // Génération des graduations X (une par heure si dates)
  let xTicksHTML = '';
  if (limits.isXDate) {
    const startDate = new Date(limits.minX);
    for (let i = 0; i <= numTicks; i++) {
      const tickDate = new Date(startDate.getTime() + i * 60 * 60 * 1000);
      const tickValue = tickDate.getTime();
      const x = scaleX(tickValue);
      xTicksHTML += `
      <line x1="${x}" y1="${height - margin.bottom}" x2="${x}" y2="${height - margin.bottom + 5}" stroke="#666" />
      <text x="${x}" y="${height - margin.bottom + 20}" text-anchor="end" font-size="10" transform="rotate(-45, ${x}, ${height - margin.bottom + 20})">${formatXLabel(tickValue)}</text>
    `;
    }
  } else {
    for (let i = 0; i <= numTicks; i++) {
      const value = limits.minX + (xRange * i / numTicks);
      const x = scaleX(value);
      xTicksHTML += `
      <line x1="${x}" y1="${height - margin.bottom}" x2="${x}" y2="${height - margin.bottom + 5}" stroke="#666" />
      <text x="${x}" y="${height - margin.bottom + 20}" text-anchor="middle" font-size="10">${formatXLabel(value)}</text>
    `;
    }
  }
  
  // Génération des graduations Y
  const yTicks = 5;
  const yTicksHTML = Array.from({ length: yTicks + 1 }, (_, i) => {
    const value = limits.minY + (yRange * i / yTicks);
    const y = scaleY(value);
    return `
      <line x1="${margin.left - 5}" y1="${y}" x2="${margin.left}" y2="${y}" stroke="#666" />
      <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="12">${value.toFixed(1)}</text>
    `;
  }).join('');
  
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="grid" width="${chartWidth / 10}" height="${chartHeight / 10}" patternUnits="userSpaceOnUse">
      <path d="M ${chartWidth / 10} 0 L 0 0 0 ${chartHeight / 10}" fill="none" stroke="#e5e7eb" stroke-width="0.5"/>
    </pattern>
  </defs>
  
  <!-- Bandes horaires alternées -->
  ${hourlyBands}
  
  <!-- Grille -->
  <rect x="${margin.left}" y="${margin.top}" width="${chartWidth}" height="${chartHeight}" fill="url(#grid)" opacity="0.3" />
  
  <!-- Axes -->
  <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#333" stroke-width="2" />
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#333" stroke-width="2" />
  
  ${xTicksHTML}
  ${yTicksHTML}
  
  <text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="14" font-weight="bold">Axe X ${limits.isXDate ? '(Temps)' : ''}</text>
  <text x="20" y="${height / 2}" text-anchor="middle" font-size="14" font-weight="bold" transform="rotate(-90, 20, ${height / 2})">Axe Y</text>
  
  ${midnightMarkers}
  ${connectingLine}
  ${points}
</svg>
  `.trim();
}

/**
 * Crée un histogramme SVG à partir des données
 * @param {Array} data - Tableau de points normalisés
 * @param {Object} options - Options de configuration
 * @returns {string} - Code SVG
 */
export function createBarChart(data, options = {}) {
  const {
    height = 300,
    margin = { top: 40, right: 40, bottom: 80, left: 60 },
    barColor = '#3b82f6',
    pixelsPerTick = 80
  } = options;
  
  const limits = calculateAxisLimits(data, { yMargin: 0 });  // Pas de marge pour les précipitations
  const yRange = limits.maxY - limits.minY || 1;
  
  // Calculer le nombre de graduations nécessaires
  let numTicks;
  let width;
  
  if (limits.isXDate) {
    const startDate = new Date(limits.minX);
    const endDate = new Date(limits.maxX);
    const hoursDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60));
    numTicks = hoursDiff;
    width = margin.left + margin.right + (numTicks * pixelsPerTick);
  } else {
    numTicks = 10;
    width = 800;
  }
  
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const xRange = limits.maxX - limits.minX || 1;
  
  // Fonction pour convertir x en nombre (timestamp si c'est une date)
  const getXValue = (x) => {
    if (limits.isXDate) {
      return new Date(x).getTime();
    }
    return x;
  };
  
  // Fonction pour formater l'affichage des dates sur l'axe X
  const formatXLabel = (value) => {
    if (limits.isXDate) {
      const date = new Date(value);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      return `${day}/${month} ${hours}h`;
    }
    return value.toFixed(1);
  };
  
  // Fonctions de scaling
  const scaleX = (x) => margin.left + ((getXValue(x) - limits.minX) / xRange) * chartWidth;
  const scaleY = (y) => height - margin.bottom - ((y - limits.minY) / yRange) * chartHeight;
  
  // Générer les marqueurs de minuit
  const midnightMarkers = generateMidnightMarkers(
    limits, 
    scaleX, 
    margin.top, 
    height - margin.bottom
  );
  
  // Calculer la largeur des barres
  const barWidth = limits.isXDate ? pixelsPerTick * 0.8 : (chartWidth / data.length) * 0.8;
  
  // Génération des barres
  const bars = data.map(point => {
    const x = scaleX(point.x) - barWidth / 2;
    const barHeight = ((point.y - limits.minY) / yRange) * chartHeight;
    const y = height - margin.bottom - barHeight;
    const displayX = limits.isXDate ? point.x : point.x.toFixed(2);
    
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${barColor}" opacity="0.8" stroke="#1e40af" stroke-width="1">
      <title>${point.label}: ${point.y} mm</title>
    </rect>`;
  }).join('\n    ');
  
  // Génération des graduations X (une par heure si dates)
  let xTicksHTML = '';
  if (limits.isXDate) {
    const startDate = new Date(limits.minX);
    for (let i = 0; i <= numTicks; i++) {
      const tickDate = new Date(startDate.getTime() + i * 60 * 60 * 1000);
      const tickValue = tickDate.getTime();
      const x = scaleX(tickValue);
      xTicksHTML += `
      <line x1="${x}" y1="${height - margin.bottom}" x2="${x}" y2="${height - margin.bottom + 5}" stroke="#666" />
      <text x="${x}" y="${height - margin.bottom + 20}" text-anchor="end" font-size="10" transform="rotate(-45, ${x}, ${height - margin.bottom + 20})">${formatXLabel(tickValue)}</text>
    `;
    }
  } else {
    for (let i = 0; i <= numTicks; i++) {
      const value = limits.minX + (xRange * i / numTicks);
      const x = scaleX(value);
      xTicksHTML += `
      <line x1="${x}" y1="${height - margin.bottom}" x2="${x}" y2="${height - margin.bottom + 5}" stroke="#666" />
      <text x="${x}" y="${height - margin.bottom + 20}" text-anchor="middle" font-size="10">${formatXLabel(value)}</text>
    `;
    }
  }
  
  // Génération des graduations Y
  const yTicks = 5;
  const yTicksHTML = Array.from({ length: yTicks + 1 }, (_, i) => {
    const value = limits.minY + (yRange * i / yTicks);
    const y = scaleY(value);
    return `
      <line x1="${margin.left - 5}" y1="${y}" x2="${margin.left}" y2="${y}" stroke="#666" />
      <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="12">${value.toFixed(1)}</text>
    `;
  }).join('');
  
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="grid-bar" width="${chartWidth / 10}" height="${chartHeight / 10}" patternUnits="userSpaceOnUse">
      <path d="M ${chartWidth / 10} 0 L 0 0 0 ${chartHeight / 10}" fill="none" stroke="#e5e7eb" stroke-width="0.5"/>
    </pattern>
  </defs>
  
  <rect x="${margin.left}" y="${margin.top}" width="${chartWidth}" height="${chartHeight}" fill="url(#grid-bar)" />
  
  <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#333" stroke-width="2" />
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#333" stroke-width="2" />
  
  ${xTicksHTML}
  ${yTicksHTML}
  
  <text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="14" font-weight="bold">Axe X ${limits.isXDate ? '(Temps)' : ''}</text>
  <text x="20" y="${height / 2}" text-anchor="middle" font-size="14" font-weight="bold" transform="rotate(-90, 20, ${height / 2})">Précipitations (mm)</text>
  
  ${midnightMarkers}
  ${bars}
</svg>
  `.trim();
}

/**
 * Crée un tableau HTML des données
 * @param {Array} data - Tableau de points
 * @returns {string} - Code HTML du tableau
 */
export function createDataTable(data) {
  const rows = data.map((point, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${point.x}</td>
      <td>${point.y}</td>
      <td>${point.label}</td>
    </tr>
  `).join('');
  
  return `
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px;">
  <thead style="background-color: #4f46e5; color: white;">
    <tr>
      <th>#</th>
      <th>X</th>
      <th>Y</th>
      <th>Label</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
  `.trim();
}

/**
 * Calcule les moyennes de température par jour et par tranche horaire
 * @param {Array} data - Tableau de points avec dates ISO en x et températures en y
 * @returns {Array} - [{date, night, morning, afternoon, evening}, ...]
 */
export function calculateTimeSlotAverages(data) {
  const dayData = {}; // Stockage par date au format YYYY-MM-DD
  
  data.forEach(point => {
    if (typeof point.x !== 'string') return;
    
    const date = new Date(point.x);
    const dateKey = date.toISOString().split('T')[0]; // Format YYYY-MM-DD
    const hour = date.getHours();
    
    if (!dayData[dateKey]) {
      dayData[dateKey] = {
        date: dateKey,
        nightValues: [],
        morningValues: [],
        afternoonValues: [],
        eveningValues: []
      };
    }
    
    if (hour >= 20 || hour < 8) {
      dayData[dateKey].nightValues.push(point.y);
    } else if (hour >= 8 && hour < 12) {
      dayData[dateKey].morningValues.push(point.y);
    } else if (hour >= 12 && hour < 17) {
      dayData[dateKey].afternoonValues.push(point.y);
    } else if (hour >= 17 && hour < 20) {
      dayData[dateKey].eveningValues.push(point.y);
    }
  });
  
  const avg = (arr) => arr.length > 0 ? arr.reduce((sum, val) => sum + val, 0) / arr.length : null;
  
  // Convertir en tableau avec moyennes calculées
  return Object.values(dayData).map(day => ({
    date: day.date,
    night: avg(day.nightValues),
    morning: avg(day.morningValues),
    afternoon: avg(day.afternoonValues),
    evening: avg(day.eveningValues),
    nightCount: day.nightValues.length,
    morningCount: day.morningValues.length,
    afternoonCount: day.afternoonValues.length,
    eveningCount: day.eveningValues.length
  })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Crée un tableau HTML de synthèse des moyennes par jour et tranche horaire
 * @param {Array} dailyAverages - Résultat de calculateTimeSlotAverages
 * @returns {string} - Code HTML du tableau
 */
export function createAveragesTable(dailyAverages) {
  const formatTemp = (temp) => temp !== null ? `${temp.toFixed(1)}°C` : '-';
  
  const rows = dailyAverages.map(day => {
    const dateObj = new Date(day.date);
    const formattedDate = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;
    
    return `
    <tr>
      <td style="font-weight: bold;">${formattedDate}</td>
      <td style="text-align: center; background-color: #1e3a8a20; font-weight: bold; color: #1e40af;">${formatTemp(day.night)}</td>
      <td style="text-align: center; background-color: #fbbf2420; font-weight: bold; color: #f59e0b;">${formatTemp(day.morning)}</td>
      <td style="text-align: center; background-color: #dc262620; font-weight: bold; color: #dc2626;">${formatTemp(day.afternoon)}</td>
      <td style="text-align: center; background-color: #7c2d1220; font-weight: bold; color: #9f1239;">${formatTemp(day.evening)}</td>
    </tr>`;
  }).join('');
  
  return `
<table border="1" cellpadding="12" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 900px; margin: 20px auto;">
  <thead style="background-color: #4f46e5; color: white;">
    <tr>
      <th style="text-align: left;">Date</th>
      <th style="text-align: center;">🌙 Nuit (20h-8h)</th>
      <th style="text-align: center;">🌅 Matinée (8h-12h)</th>
      <th style="text-align: center;">☀️ Après-midi (12h-17h)</th>
      <th style="text-align: center;">🌆 Soirée (17h-20h)</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
  `.trim();
}

/**
 * Calcule les sommes de précipitations par jour et par tranche horaire
 * @param {Array} data - Tableau de points avec dates ISO en x et précipitations en y
 * @returns {Array} - [{date, night, morning, afternoon, evening}, ...]
 */
export function calculatePrecipitationSums(data) {
  const dayData = {};
  
  data.forEach(point => {
    if (typeof point.x !== 'string') return;
    
    const date = new Date(point.x);
    const dateKey = date.toISOString().split('T')[0];
    const hour = date.getHours();
    
    if (!dayData[dateKey]) {
      dayData[dateKey] = {
        date: dateKey,
        nightValues: [],
        morningValues: [],
        afternoonValues: [],
        eveningValues: []
      };
    }
    
    if (hour >= 20 || hour < 8) {
      dayData[dateKey].nightValues.push(point.y);
    } else if (hour >= 8 && hour < 12) {
      dayData[dateKey].morningValues.push(point.y);
    } else if (hour >= 12 && hour < 17) {
      dayData[dateKey].afternoonValues.push(point.y);
    } else if (hour >= 17 && hour < 20) {
      dayData[dateKey].eveningValues.push(point.y);
    }
  });
  
  const sum = (arr) => arr.length > 0 ? arr.reduce((total, val) => total + val, 0) : 0;
  
  return Object.values(dayData).map(day => ({
    date: day.date,
    night: sum(day.nightValues),
    morning: sum(day.morningValues),
    afternoon: sum(day.afternoonValues),
    evening: sum(day.eveningValues)
  })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Crée un tableau HTML de synthèse des précipitations par jour et tranche horaire
 * @param {Array} dailySums - Résultat de calculatePrecipitationSums
 * @returns {string} - Code HTML du tableau
 */
export function createPrecipitationTable(dailySums) {
  const formatPrecip = (precip) => `${precip.toFixed(1)} mm`;
  
  const rows = dailySums.map(day => {
    const dateObj = new Date(day.date);
    const formattedDate = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;
    
    return `
    <tr>
      <td style="font-weight: bold;">${formattedDate}</td>
      <td style="text-align: center; background-color: #1e3a8a20; font-weight: bold; color: #1e40af;">${formatPrecip(day.night)}</td>
      <td style="text-align: center; background-color: #fbbf2420; font-weight: bold; color: #f59e0b;">${formatPrecip(day.morning)}</td>
      <td style="text-align: center; background-color: #dc262620; font-weight: bold; color: #dc2626;">${formatPrecip(day.afternoon)}</td>
      <td style="text-align: center; background-color: #7c2d1220; font-weight: bold; color: #9f1239;">${formatPrecip(day.evening)}</td>
    </tr>`;
  }).join('');
  
  return `
<table border="1" cellpadding="12" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 900px; margin: 20px auto;">
  <thead style="background-color: #3b82f6; color: white;">
    <tr>
      <th style="text-align: left;">Date</th>
      <th style="text-align: center;">🌙 Nuit (20h-8h)</th>
      <th style="text-align: center;">🌅 Matinée (8h-12h)</th>
      <th style="text-align: center;">☀️ Après-midi (12h-17h)</th>
      <th style="text-align: center;">🌆 Soirée (17h-20h)</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
  `.trim();
}

/**
 * Calcule les moyennes d'humidité par jour et par tranche horaire
 * @param {Array} data - Tableau de points avec dates ISO en x et humidité en y
 * @returns {Array} - [{date, night, morning, afternoon, evening}, ...]
 */
export function calculateHumidityAverages(data) {
  const dayData = {};
  
  data.forEach(point => {
    if (typeof point.x !== 'string') return;
    
    const date = new Date(point.x);
    const dateKey = date.toISOString().split('T')[0];
    const hour = date.getHours();
    
    if (!dayData[dateKey]) {
      dayData[dateKey] = {
        date: dateKey,
        nightValues: [],
        morningValues: [],
        afternoonValues: [],
        eveningValues: []
      };
    }
    
    if (hour >= 20 || hour < 8) {
      dayData[dateKey].nightValues.push(point.y);
    } else if (hour >= 8 && hour < 12) {
      dayData[dateKey].morningValues.push(point.y);
    } else if (hour >= 12 && hour < 17) {
      dayData[dateKey].afternoonValues.push(point.y);
    } else if (hour >= 17 && hour < 20) {
      dayData[dateKey].eveningValues.push(point.y);
    }
  });
  
  const avg = (arr) => arr.length > 0 ? arr.reduce((sum, val) => sum + val, 0) / arr.length : null;
  
  return Object.values(dayData).map(day => ({
    date: day.date,
    night: avg(day.nightValues),
    morning: avg(day.morningValues),
    afternoon: avg(day.afternoonValues),
    evening: avg(day.eveningValues)
  })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Crée un tableau HTML de synthèse de l'humidité par jour et tranche horaire
 * @param {Array} dailyAverages - Résultat de calculateHumidityAverages
 * @returns {string} - Code HTML du tableau
 */
export function createHumidityTable(dailyAverages) {
  const formatHumidity = (humidity) => humidity !== null ? `${humidity.toFixed(1)}%` : '-';
  
  const rows = dailyAverages.map(day => {
    const dateObj = new Date(day.date);
    const formattedDate = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;
    
    return `
    <tr>
      <td style="font-weight: bold;">${formattedDate}</td>
      <td style="text-align: center; background-color: #1e3a8a20; font-weight: bold; color: #1e40af;">${formatHumidity(day.night)}</td>
      <td style="text-align: center; background-color: #fbbf2420; font-weight: bold; color: #f59e0b;">${formatHumidity(day.morning)}</td>
      <td style="text-align: center; background-color: #dc262620; font-weight: bold; color: #dc2626;">${formatHumidity(day.afternoon)}</td>
      <td style="text-align: center; background-color: #7c2d1220; font-weight: bold; color: #9f1239;">${formatHumidity(day.evening)}</td>
    </tr>`;
  }).join('');
  
  return `
<table border="1" cellpadding="12" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 900px; margin: 20px auto;">
  <thead style="background-color: #06b6d4; color: white;">
    <tr>
      <th style="text-align: left;">Date</th>
      <th style="text-align: center;">🌙 Nuit (20h-8h)</th>
      <th style="text-align: center;">🌅 Matinée (8h-12h)</th>
      <th style="text-align: center;">☀️ Après-midi (12h-17h)</th>
      <th style="text-align: center;">🌆 Soirée (17h-20h)</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
  `.trim();
}

/**
 * Calcule les moyennes de vitesse du vent (rafales) par jour et par tranche horaire
 * @param {Array} data - Tableau de points avec dates ISO en x et vitesse du vent en y
 * @returns {Array} - [{date, night, morning, afternoon, evening}, ...]
 */
export function calculateWindGustsAverages(data) {
  const dayData = {};
  
  data.forEach(point => {
    if (typeof point.x !== 'string') return;
    
    const date = new Date(point.x);
    const dateKey = date.toISOString().split('T')[0];
    const hour = date.getHours();
    
    if (!dayData[dateKey]) {
      dayData[dateKey] = {
        date: dateKey,
        nightValues: [],
        morningValues: [],
        afternoonValues: [],
        eveningValues: []
      };
    }
    
    if (hour >= 20 || hour < 8) {
      dayData[dateKey].nightValues.push(point.y);
    } else if (hour >= 8 && hour < 12) {
      dayData[dateKey].morningValues.push(point.y);
    } else if (hour >= 12 && hour < 17) {
      dayData[dateKey].afternoonValues.push(point.y);
    } else if (hour >= 17 && hour < 20) {
      dayData[dateKey].eveningValues.push(point.y);
    }
  });
  
  const avg = (arr) => arr.length > 0 ? arr.reduce((sum, val) => sum + val, 0) / arr.length : null;
  
  return Object.values(dayData).map(day => ({
    date: day.date,
    night: avg(day.nightValues),
    morning: avg(day.morningValues),
    afternoon: avg(day.afternoonValues),
    evening: avg(day.eveningValues)
  })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Crée un tableau consolidé avec toutes les données météo
 * @param {Object} allData - Objet contenant {temps, tempsApparent, precip, humidity, wind}
 * @returns {string} - Code HTML du tableau
 */
export function createConsolidatedTable(allData) {
  const { temps, tempsApparent, precip, humidity, wind } = allData;
  
  const formatTemp = (temp) => temp !== null ? `${temp.toFixed(1)}°C` : '-';
  const formatPrecip = (p) => `${p.toFixed(1)} mm`;
  const formatHumidity = (h) => h !== null ? `${h.toFixed(1)}%` : '-';
  const formatWind = (w) => w !== null ? `${w.toFixed(1)} km/h` : '-';
  
  const timeSlots = [
    { key: 'night', label: '🌙 Nuit', bg: '#1e3a8a15' },
    { key: 'morning', label: '🌅 Matinée', bg: '#fbbf2415' },
    { key: 'afternoon', label: '☀️ Après-midi', bg: '#dc262615' },
    { key: 'evening', label: '🌆 Soirée', bg: '#9f123915' }
  ];
  
  const rows = [];
  temps.forEach((day, idx) => {
    const dateObj = new Date(day.date);
    const formattedDate = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;
    
    timeSlots.forEach((slot, slotIdx) => {
      const isFirstSlot = slotIdx === 0;
      const rowspan = isFirstSlot ? 4 : 0;
      
      rows.push(`
      <tr style="background-color: ${slot.bg};">
        ${isFirstSlot ? `<td rowspan="4" style="font-weight: bold; vertical-align: middle; border-right: 2px solid #4f46e5;">${formattedDate}</td>` : ''}
        <td style="font-weight: bold;">${slot.label}</td>
        <td style="text-align: center;">${formatTemp(day[slot.key])}</td>
        <td style="text-align: center;">${formatTemp(tempsApparent[idx][slot.key])}</td>
        <td style="text-align: center;">${formatPrecip(precip[idx][slot.key])}</td>
        <td style="text-align: center;">${formatHumidity(humidity[idx][slot.key])}</td>
        <td style="text-align: center;">${formatWind(wind[idx][slot.key])}</td>
      </tr>`);
    });
  });
  
  return `
<table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 20px auto;">
  <thead style="background-color: #4f46e5; color: white;">
    <tr>
      <th style="text-align: left;">Date</th>
      <th style="text-align: left;">Plage horaire</th>
      <th style="text-align: center;">Température mesurée</th>
      <th style="text-align: center;">Température ressentie</th>
      <th style="text-align: center;">Précipitations</th>
      <th style="text-align: center;">Humidité</th>
      <th style="text-align: center;">Vent (rafales)</th>
    </tr>
  </thead>
  <tbody>
    ${rows.join('')}
  </tbody>
</table>
  `.trim();
}
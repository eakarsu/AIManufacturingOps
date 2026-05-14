const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

class OpenRouterService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022';
    this.baseUrl = 'openrouter.ai';
  }

  async makeRequest(messages, systemPrompt) {
    if (!this.apiKey) {
      const e = new Error('AI provider not configured (OPENROUTER_API_KEY missing)');
      e.statusCode = 503;
      return Promise.reject(e);
    }
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        max_tokens: 10000,
        temperature: 0.7
      });

      const options = {
        hostname: this.baseUrl,
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'AI Manufacturing Ops'
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            if (parsed.error) {
              reject(new Error(parsed.error.message || 'OpenRouter API error'));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(new Error('Failed to parse OpenRouter response'));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(data);
      req.end();
    });
  }

  // Predictive Maintenance AI
  async predictMaintenance(equipment) {
    const systemPrompt = `You are an AI expert in predictive maintenance for manufacturing equipment.
    Analyze the equipment data and provide:
    1. Failure risk assessment (Low/Medium/High/Critical)
    2. Recommended actions
    3. Estimated time until maintenance needed
    4. Key risk factors
    5. Cost-saving opportunities
    Be specific and actionable in your recommendations.`;

    const userMessage = `Analyze this equipment for maintenance prediction:
    - Name: ${equipment.name}
    - Type: ${equipment.type}
    - Location: ${equipment.location}
    - Current Status: ${equipment.status}
    - Temperature: ${equipment.temperature}°C
    - Vibration Level: ${equipment.vibration} mm/s
    - Runtime Hours: ${equipment.runtime_hours}
    - Last Maintenance: ${equipment.last_maintenance}
    - Next Scheduled Maintenance: ${equipment.next_maintenance}
    - Current Failure Probability: ${equipment.failure_probability}%`;

    try {
      const response = await this.makeRequest([{ role: 'user', content: userMessage }], systemPrompt);
      return {
        success: true,
        analysis: response.choices[0].message.content,
        model: this.model,
        usage: response.usage
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        analysis: this.getFallbackMaintenanceAnalysis(equipment)
      };
    }
  }

  // Route Optimization AI
  async optimizeRoute(route) {
    const systemPrompt = `You are an AI expert in logistics and route optimization.
    Analyze the route data and provide:
    1. Optimized route suggestions
    2. Estimated fuel savings
    3. Time optimization opportunities
    4. Weather/traffic considerations
    5. Alternative routes if applicable
    Be specific with distances and times.`;

    const userMessage = `Optimize this delivery route:
    - Route Name: ${route.name}
    - Origin: ${route.origin}
    - Destination: ${route.destination}
    - Current Distance: ${route.distance} km
    - Estimated Time: ${route.estimated_time} minutes
    - Vehicle Type: ${route.vehicle_type}
    - Priority: ${route.priority}
    - Current Waypoints: ${route.waypoints || 'None'}`;

    try {
      const response = await this.makeRequest([{ role: 'user', content: userMessage }], systemPrompt);
      return {
        success: true,
        optimization: response.choices[0].message.content,
        model: this.model,
        usage: response.usage
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        optimization: this.getFallbackRouteOptimization(route)
      };
    }
  }

  // Safety Incident Prediction AI
  async predictSafetyRisk(incident) {
    const systemPrompt = `You are an AI expert in workplace safety and incident prevention.
    Analyze the safety incident/hazard data and provide:
    1. Risk severity assessment
    2. Immediate actions required
    3. Long-term prevention strategies
    4. Related hazards to watch for
    5. Compliance recommendations (OSHA, etc.)
    Be specific and prioritize worker safety.`;

    const userMessage = `Analyze this safety concern:
    - Title: ${incident.title}
    - Description: ${incident.description}
    - Location: ${incident.location}
    - Severity: ${incident.severity}
    - Incident Type: ${incident.incident_type}
    - Current Risk Score: ${incident.risk_score}%
    - Status: ${incident.status}
    - Reported By: ${incident.reported_by}`;

    try {
      const response = await this.makeRequest([{ role: 'user', content: userMessage }], systemPrompt);
      return {
        success: true,
        prediction: response.choices[0].message.content,
        model: this.model,
        usage: response.usage
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        prediction: this.getFallbackSafetyPrediction(incident)
      };
    }
  }

  // Assembly Line Optimization AI
  async optimizeAssemblyLine(line) {
    const systemPrompt = `You are an AI expert in lean manufacturing and assembly line optimization.
    Analyze the assembly line data and provide:
    1. Efficiency improvement recommendations
    2. Bottleneck resolution strategies
    3. Worker allocation suggestions
    4. Station rebalancing recommendations
    5. Capacity optimization opportunities
    Focus on actionable improvements with expected impact.`;

    const userMessage = `Optimize this assembly line:
    - Line Name: ${line.name}
    - Product: ${line.product}
    - Capacity: ${line.capacity} units/day
    - Current Output: ${line.current_output} units/day
    - Efficiency: ${line.efficiency}%
    - Workers: ${line.workers}
    - Stations: ${line.stations}
    - Current Bottleneck: ${line.bottleneck || 'None identified'}
    - Status: ${line.status}`;

    try {
      const response = await this.makeRequest([{ role: 'user', content: userMessage }], systemPrompt);
      return {
        success: true,
        optimization: response.choices[0].message.content,
        model: this.model,
        usage: response.usage
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        optimization: this.getFallbackAssemblyOptimization(line)
      };
    }
  }

  // Supply Chain Analysis AI
  async analyzeSupplyChain(item) {
    const systemPrompt = `You are an AI expert in supply chain management and logistics.
    Analyze the supply chain item data and provide:
    1. Delivery risk assessment
    2. Alternative supplier recommendations
    3. Inventory optimization suggestions
    4. Cost reduction opportunities
    5. Supply chain resilience improvements
    Be specific about timelines and potential impacts.`;

    const userMessage = `Analyze this supply chain item:
    - Item: ${item.item_name}
    - Supplier: ${item.supplier}
    - Origin: ${item.origin_location}
    - Current Location: ${item.current_location}
    - Destination: ${item.destination}
    - Quantity: ${item.quantity}
    - Status: ${item.status}
    - Estimated Arrival: ${item.estimated_arrival}
    - Tracking: ${item.tracking_number}`;

    try {
      const response = await this.makeRequest([{ role: 'user', content: userMessage }], systemPrompt);
      return {
        success: true,
        analysis: response.choices[0].message.content,
        model: this.model,
        usage: response.usage
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        analysis: this.getFallbackSupplyChainAnalysis(item)
      };
    }
  }

  // Fallback analyses when API is unavailable
  getFallbackMaintenanceAnalysis(equipment) {
    const riskLevel = equipment.failure_probability > 60 ? 'Critical' :
                      equipment.failure_probability > 40 ? 'High' :
                      equipment.failure_probability > 20 ? 'Medium' : 'Low';

    return `## Maintenance Analysis for ${equipment.name}

### Risk Assessment: ${riskLevel}

**Key Indicators:**
- Temperature: ${equipment.temperature}°C ${equipment.temperature > 50 ? '⚠️ Above normal' : '✅ Normal'}
- Vibration: ${equipment.vibration} mm/s ${equipment.vibration > 4 ? '⚠️ Elevated' : '✅ Normal'}
- Runtime: ${equipment.runtime_hours} hours

**Recommended Actions:**
1. ${riskLevel === 'Critical' || riskLevel === 'High' ? 'Schedule immediate inspection' : 'Continue regular monitoring'}
2. Check lubrication levels
3. Verify calibration settings
4. Review maintenance history

**Next Steps:**
- Priority: ${riskLevel}
- Estimated maintenance window: ${riskLevel === 'Critical' ? '24-48 hours' : riskLevel === 'High' ? '1 week' : '2-4 weeks'}`;
  }

  getFallbackRouteOptimization(route) {
    return `## Route Optimization for ${route.name}

### Current Route Analysis

**Route Details:**
- Distance: ${route.distance} km
- Time: ${route.estimated_time} minutes
- Vehicle: ${route.vehicle_type}

**Optimization Suggestions:**
1. Consider route timing to avoid peak traffic
2. Optimize waypoint sequence for fuel efficiency
3. Check for road construction or closures

**Estimated Improvements:**
- Potential time savings: 10-15%
- Fuel savings: 5-10%

**Priority: ${route.priority}**`;
  }

  getFallbackSafetyPrediction(incident) {
    return `## Safety Analysis for ${incident.title}

### Risk Level: ${incident.severity.toUpperCase()}

**Incident Details:**
- Type: ${incident.incident_type}
- Location: ${incident.location}
- Risk Score: ${incident.risk_score}%

**Immediate Actions Required:**
1. ${incident.severity === 'critical' ? 'Evacuate area immediately' : 'Secure the affected area'}
2. Document the incident thoroughly
3. Notify relevant personnel
4. Implement temporary safeguards

**Prevention Strategies:**
- Regular safety audits
- Employee training refresh
- Equipment maintenance review

**Compliance Note:** Ensure OSHA reporting requirements are met.`;
  }

  getFallbackAssemblyOptimization(line) {
    const efficiencyGap = line.capacity - line.current_output;

    return `## Assembly Line Analysis for ${line.name}

### Current Performance
- Efficiency: ${line.efficiency}%
- Output Gap: ${efficiencyGap} units/day
- Bottleneck: ${line.bottleneck || 'None identified'}

**Optimization Recommendations:**
1. ${line.bottleneck ? `Address bottleneck at ${line.bottleneck}` : 'Focus on preventive maintenance'}
2. Review worker task allocation
3. Implement continuous flow where possible
4. Consider automation opportunities

**Expected Improvements:**
- Potential efficiency gain: 10-15%
- Additional output: ${Math.round(efficiencyGap * 0.5)} units/day`;
  }

  getFallbackSupplyChainAnalysis(item) {
    return `## Supply Chain Analysis for ${item.item_name}

### Current Status: ${item.status.toUpperCase()}

**Shipment Details:**
- Supplier: ${item.supplier}
- Quantity: ${item.quantity} units
- ETA: ${item.estimated_arrival}

**Risk Assessment:**
- Delivery risk: ${item.status === 'customs' ? 'Medium - Customs processing' : 'Low'}
- Supply continuity: Stable

**Recommendations:**
1. Monitor tracking updates
2. Prepare receiving area
3. Update inventory systems
4. Coordinate with production planning

**Alternative Actions:**
- Identify backup suppliers
- Review safety stock levels`;
  }

  // Quality defect prediction (mechanical backlog)
  async predictQualityDefects(payload) {
    const systemPrompt = `You are an AI expert in manufacturing quality control and SPC.
Given recent production / inspection data, return a JSON-style structured analysis.
Provide:
1. Defect risk level (Low/Medium/High/Critical)
2. Most-likely defect modes
3. Root-cause hypotheses
4. Inspection-frequency recommendation
5. Corrective actions ranked by impact`;
    const userMessage = `Predict defects for this production batch:\n${JSON.stringify(payload, null, 2).slice(0, 3500)}`;
    const response = await this.makeRequest([{ role: 'user', content: userMessage }], systemPrompt);
    return {
      success: true,
      prediction: response.choices[0].message.content,
      model: this.model,
      usage: response.usage
    };
  }

  // OEE anomaly detection (mechanical backlog)
  async detectOEEAnomalies(payload) {
    const systemPrompt = `You are an AI expert in OEE (Overall Equipment Effectiveness) and lean manufacturing.
Compare current OEE components (Availability, Performance, Quality) against trend and identify anomalies.
Provide a structured analysis with severity, contributing factor, and a recommended next-shift action.`;
    const userMessage = `OEE / production telemetry:\n${JSON.stringify(payload, null, 2).slice(0, 3500)}`;
    const response = await this.makeRequest([{ role: 'user', content: userMessage }], systemPrompt);
    return {
      success: true,
      analysis: response.choices[0].message.content,
      model: this.model,
      usage: response.usage
    };
  }

  // Inventory stockout prediction (mechanical backlog)
  async predictInventoryStockout(payload) {
    const systemPrompt = `You are an AI expert in inventory management and demand planning.
Given SKU level, lead times, demand history, and pending orders, predict stockout risk.
Return structured analysis with: stockout_risk (Low/Medium/High/Critical), days_to_stockout, recommended_reorder_quantity, alternative_actions.`;
    const userMessage = `Inventory data:\n${JSON.stringify(payload, null, 2).slice(0, 3500)}`;
    const response = await this.makeRequest([{ role: 'user', content: userMessage }], systemPrompt);
    return {
      success: true,
      prediction: response.choices[0].message.content,
      model: this.model,
      usage: response.usage
    };
  }
}

module.exports = new OpenRouterService();

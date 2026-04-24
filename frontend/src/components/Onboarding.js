import React, { useState } from 'react';

const steps = [
  {
    title: 'Welcome to AI Manufacturing Ops',
    description:
      'Your centralized dashboard gives you a real-time overview of all manufacturing operations. Monitor equipment status, active alerts, production metrics, and key performance indicators all in one place.',
    icon: 'Dashboard'
  },
  {
    title: 'Equipment & Maintenance',
    description:
      'Track all your manufacturing equipment, schedule preventive maintenance, and receive AI-powered predictions for potential failures before they happen. Keep your production line running smoothly with proactive maintenance management.',
    icon: 'Equipment'
  },
  {
    title: 'Production Routes',
    description:
      'Define and optimize production routes through your facility. Monitor each step in the manufacturing process, track throughput, and identify bottlenecks to maximize efficiency across your operations.',
    icon: 'Routes'
  },
  {
    title: 'Safety Management',
    description:
      'Report and track safety incidents, manage compliance checklists, and monitor safety metrics. The platform helps you maintain a safe working environment and stay compliant with regulatory requirements.',
    icon: 'Safety'
  },
  {
    title: 'Assembly Lines & Supply Chain',
    description:
      'Monitor assembly line performance in real time and manage your entire supply chain. Track suppliers, inventory levels, and procurement to ensure uninterrupted production with optimal resource allocation.',
    icon: 'Assembly'
  }
];

const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.8)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000
};

const cardStyle = {
  background: '#1e293b',
  borderRadius: 12,
  padding: '40px 48px',
  maxWidth: 520,
  width: '90%',
  color: '#e2e8f0',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  textAlign: 'center',
  position: 'relative'
};

const titleStyle = {
  fontSize: 22,
  fontWeight: 700,
  marginBottom: 16,
  color: '#60a5fa'
};

const descriptionStyle = {
  fontSize: 15,
  lineHeight: 1.7,
  color: '#cbd5e1',
  marginBottom: 32
};

const buttonRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12
};

const btnStyle = {
  padding: '10px 24px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
  transition: 'opacity 0.2s'
};

const btnPrimaryStyle = {
  ...btnStyle,
  background: '#3b82f6',
  color: '#fff'
};

const btnSecondaryStyle = {
  ...btnStyle,
  background: '#334155',
  color: '#94a3b8'
};

const btnSkipStyle = {
  ...btnStyle,
  background: 'transparent',
  color: '#64748b',
  textDecoration: 'underline',
  padding: '10px 12px'
};

const dotsContainerStyle = {
  display: 'flex',
  justifyContent: 'center',
  gap: 8,
  marginTop: 24
};

const iconContainerStyle = {
  width: 64,
  height: 64,
  borderRadius: '50%',
  background: '#334155',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 20px',
  fontSize: 24,
  color: '#60a5fa',
  fontWeight: 700
};

const stepCounterStyle = {
  fontSize: 13,
  color: '#64748b',
  marginBottom: 8
};

function Onboarding({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeOnboarding();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const completeOnboarding = () => {
    localStorage.setItem('onboarding_completed', 'true');
    if (onComplete) onComplete();
  };

  const step = steps[currentStep];

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={stepCounterStyle}>
          Step {currentStep + 1} of {steps.length}
        </div>

        <div style={iconContainerStyle}>{step.icon.charAt(0)}</div>

        <h2 style={titleStyle}>{step.title}</h2>
        <p style={descriptionStyle}>{step.description}</p>

        <div style={buttonRowStyle}>
          <button
            style={btnSkipStyle}
            onClick={completeOnboarding}
          >
            Skip
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {currentStep > 0 && (
              <button style={btnSecondaryStyle} onClick={handlePrevious}>
                Previous
              </button>
            )}
            <button style={btnPrimaryStyle} onClick={handleNext}>
              {currentStep < steps.length - 1 ? 'Next' : 'Get Started'}
            </button>
          </div>
        </div>

        <div style={dotsContainerStyle}>
          {steps.map((_, index) => (
            <div
              key={index}
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: index === currentStep ? '#3b82f6' : '#475569',
                transition: 'background 0.3s'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default Onboarding;

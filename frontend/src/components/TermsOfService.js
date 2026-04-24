import React from 'react';

function TermsOfService() {
  return (
    <div>
      <div className="data-section">
        <h2 className="section-header">Terms of Service</h2>
        <p style={{ color: '#94a3b8', marginBottom: 24 }}>
          Last updated: February 2026
        </p>
        <p style={{ lineHeight: 1.7 }}>
          Welcome to AI Manufacturing Ops. These Terms of Service ("Terms") govern your access
          to and use of our manufacturing operations management platform. Please read these Terms
          carefully before using the platform.
        </p>
      </div>

      <div className="data-section">
        <h2 className="section-header">Acceptance of Terms</h2>
        <p style={{ lineHeight: 1.7 }}>
          By accessing or using the AI Manufacturing Ops platform, you agree to be bound by these
          Terms and all applicable laws and regulations. If you do not agree with any part of these
          Terms, you may not access the platform. These Terms constitute a legally binding agreement
          between you (and/or the organization you represent) and AI Manufacturing Ops. Your continued
          use of the platform following the posting of changes to these Terms constitutes acceptance
          of those changes.
        </p>
      </div>

      <div className="data-section">
        <h2 className="section-header">Description of Services</h2>
        <p style={{ lineHeight: 1.7, marginBottom: 12 }}>
          AI Manufacturing Ops provides a comprehensive manufacturing operations management platform
          that includes, but is not limited to:
        </p>
        <ul style={{ lineHeight: 2, paddingLeft: 24, color: '#cbd5e1' }}>
          <li>Equipment tracking and management with AI-powered predictive maintenance.</li>
          <li>Production route definition, monitoring, and optimization.</li>
          <li>Safety incident reporting, tracking, and compliance management.</li>
          <li>Assembly line performance monitoring and analytics.</li>
          <li>Supply chain management including supplier tracking and inventory management.</li>
          <li>Real-time dashboards, notifications, and reporting tools.</li>
          <li>File upload and document management for operational records.</li>
        </ul>
        <p style={{ lineHeight: 1.7, marginTop: 12 }}>
          We reserve the right to modify, suspend, or discontinue any aspect of the platform at
          any time with reasonable notice to affected users.
        </p>
      </div>

      <div className="data-section">
        <h2 className="section-header">User Obligations</h2>
        <p style={{ lineHeight: 1.7, marginBottom: 12 }}>
          As a user of the platform, you agree to:
        </p>
        <ul style={{ lineHeight: 2, paddingLeft: 24, color: '#cbd5e1' }}>
          <li>Provide accurate and complete information when creating your account and entering operational data.</li>
          <li>Maintain the security of your account credentials and not share them with unauthorized individuals.</li>
          <li>Use the platform only for legitimate manufacturing operations purposes.</li>
          <li>Comply with all applicable laws, regulations, and industry standards relevant to your operations.</li>
          <li>Report any security vulnerabilities or unauthorized access promptly.</li>
          <li>Not attempt to reverse-engineer, decompile, or disassemble any part of the platform.</li>
          <li>Not use the platform to store or transmit malicious code or harmful content.</li>
        </ul>
      </div>

      <div className="data-section">
        <h2 className="section-header">Intellectual Property</h2>
        <p style={{ lineHeight: 1.7 }}>
          The AI Manufacturing Ops platform, including all software, algorithms, designs, text,
          graphics, and other content, is the intellectual property of AI Manufacturing Ops and
          is protected by applicable copyright, trademark, and other intellectual property laws.
          You retain ownership of all manufacturing data, documents, and operational records you
          enter into the platform. By using the platform, you grant us a limited license to process
          and store your data solely for the purpose of providing and improving our services. We
          do not claim ownership over your operational data.
        </p>
      </div>

      <div className="data-section">
        <h2 className="section-header">Limitation of Liability</h2>
        <p style={{ lineHeight: 1.7 }}>
          To the maximum extent permitted by applicable law, AI Manufacturing Ops and its officers,
          directors, employees, and agents shall not be liable for any indirect, incidental, special,
          consequential, or punitive damages, including but not limited to loss of profits, data,
          production time, or goodwill, arising out of or in connection with your use of the platform.
          The platform provides AI-powered predictions and recommendations as decision-support tools
          only. These should not be relied upon as the sole basis for critical operational, safety,
          or maintenance decisions. Users are responsible for independently verifying all predictions
          and exercising professional judgment. Our total liability for any claims arising from your
          use of the platform shall not exceed the amount paid by you for the platform in the twelve
          months preceding the claim.
        </p>
      </div>

      <div className="data-section">
        <h2 className="section-header">Termination</h2>
        <p style={{ lineHeight: 1.7 }}>
          We may suspend or terminate your access to the platform at any time for violation of
          these Terms, non-payment of applicable fees, or any other reason with reasonable notice.
          You may terminate your use of the platform at any time by contacting our support team.
          Upon termination, your right to access the platform ceases immediately. We will retain
          your data for a period of 30 days following termination, during which you may request
          an export of your manufacturing records. After this retention period, your data will be
          permanently deleted from our systems unless retention is required by applicable law or
          regulation. Provisions of these Terms that by their nature should survive termination
          shall remain in effect.
        </p>
      </div>
    </div>
  );
}

export default TermsOfService;

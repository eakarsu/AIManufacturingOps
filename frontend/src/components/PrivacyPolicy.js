import React from 'react';

function PrivacyPolicy() {
  const handleBack = () => {
    window.history.back();
  };

  return (
    <div>
      <div className="data-section">
        <h2 className="section-header">Privacy Policy</h2>
        <p style={{ color: '#94a3b8', marginBottom: 24 }}>
          Last updated: February 2026
        </p>

        <button
          className="btn-primary"
          onClick={handleBack}
          style={{ marginBottom: 24 }}
        >
          Back
        </button>

        <p style={{ lineHeight: 1.7, marginBottom: 24 }}>
          This Privacy Policy describes how AI Manufacturing Ops ("we", "our", or "the platform")
          collects, uses, and protects information in connection with our manufacturing operations
          management platform. By using the platform, you agree to the practices described in this policy.
        </p>
      </div>

      <div className="data-section">
        <h2 className="section-header">Information Collection</h2>
        <p style={{ lineHeight: 1.7, marginBottom: 12 }}>
          We collect information that you provide directly when using the platform, including:
        </p>
        <ul style={{ lineHeight: 2, paddingLeft: 24, color: '#cbd5e1' }}>
          <li>Account information such as name, email address, and role within your organization.</li>
          <li>Manufacturing data including equipment records, maintenance logs, production routes, and assembly line metrics.</li>
          <li>Safety incident reports and compliance documentation.</li>
          <li>Supply chain information such as supplier details, inventory records, and procurement data.</li>
          <li>Files and documents uploaded to the platform.</li>
          <li>Usage data such as login activity, feature usage patterns, and session information.</li>
        </ul>
      </div>

      <div className="data-section">
        <h2 className="section-header">Data Usage</h2>
        <p style={{ lineHeight: 1.7, marginBottom: 12 }}>
          The information we collect is used for the following purposes:
        </p>
        <ul style={{ lineHeight: 2, paddingLeft: 24, color: '#cbd5e1' }}>
          <li>Operating and improving the manufacturing operations platform.</li>
          <li>Providing AI-powered analytics, predictions, and recommendations for equipment maintenance and production optimization.</li>
          <li>Generating reports and dashboards for operational visibility.</li>
          <li>Sending notifications and alerts related to equipment status, safety incidents, and supply chain events.</li>
          <li>Ensuring compliance with safety regulations and organizational policies.</li>
          <li>Providing customer support and responding to inquiries.</li>
        </ul>
      </div>

      <div className="data-section">
        <h2 className="section-header">Data Security</h2>
        <p style={{ lineHeight: 1.7 }}>
          We implement industry-standard security measures to protect your data, including encryption
          of data in transit and at rest, role-based access controls, regular security audits,
          and secure authentication mechanisms. Access to manufacturing data is restricted based on
          user roles and organizational permissions. We regularly review and update our security
          practices to address emerging threats and maintain the confidentiality, integrity, and
          availability of your information.
        </p>
      </div>

      <div className="data-section">
        <h2 className="section-header">Third Parties</h2>
        <p style={{ lineHeight: 1.7 }}>
          We do not sell your manufacturing data to third parties. We may share information with
          trusted service providers who assist in operating the platform, subject to strict
          confidentiality agreements. We may also disclose information when required by law,
          regulation, or legal process. Any third-party integrations you enable (such as ERP
          systems or IoT device connections) are governed by their respective privacy policies.
        </p>
      </div>

      <div className="data-section">
        <h2 className="section-header">Your Rights</h2>
        <p style={{ lineHeight: 1.7, marginBottom: 12 }}>
          You have the following rights regarding your data:
        </p>
        <ul style={{ lineHeight: 2, paddingLeft: 24, color: '#cbd5e1' }}>
          <li>Access and review the personal and operational data we hold about you.</li>
          <li>Request correction of inaccurate or incomplete data.</li>
          <li>Request deletion of your account and associated personal data, subject to legal retention requirements.</li>
          <li>Export your manufacturing data in standard formats.</li>
          <li>Opt out of non-essential communications and notifications.</li>
          <li>Withdraw consent for data processing where applicable.</li>
        </ul>
      </div>

      <div className="data-section">
        <h2 className="section-header">Contact</h2>
        <p style={{ lineHeight: 1.7 }}>
          If you have questions or concerns about this Privacy Policy or our data practices,
          please contact our Data Protection team at{' '}
          <strong>privacy@aimanufacturingops.com</strong> or write to us at:
        </p>
        <p style={{ lineHeight: 1.7, marginTop: 12, color: '#94a3b8' }}>
          AI Manufacturing Ops<br />
          Data Protection Office<br />
          123 Industrial Boulevard, Suite 400<br />
          Manufacturing City, MC 10001
        </p>
      </div>
    </div>
  );
}

export default PrivacyPolicy;

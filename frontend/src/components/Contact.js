import React, { useState } from 'react';

function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      alert('Please fill in all fields.');
      return;
    }
    alert(
      'Thank you for your message, ' +
        formData.name +
        '! We will get back to you within 1-2 business days.'
    );
    setFormData({ name: '', email: '', subject: '', message: '' });
  };

  return (
    <div>
      <div className="data-section">
        <h2 className="section-header">Contact & Support</h2>
        <p style={{ lineHeight: 1.7, marginBottom: 24, color: '#94a3b8' }}>
          Have a question, need technical support, or want to provide feedback?
          Reach out to our team using the form below or through our direct contact channels.
        </p>
      </div>

      <div className="data-section">
        <h2 className="section-header">Send Us a Message</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Your full name"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="your.email@company.com"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Subject</label>
            <select name="subject" value={formData.subject} onChange={handleChange}>
              <option value="">Select a subject</option>
              <option value="Technical Support">Technical Support</option>
              <option value="Account Issue">Account Issue</option>
              <option value="Feature Request">Feature Request</option>
              <option value="Bug Report">Bug Report</option>
              <option value="Billing Inquiry">Billing Inquiry</option>
              <option value="General Question">General Question</option>
            </select>
          </div>

          <div className="form-group">
            <label>Message</label>
            <textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              placeholder="Describe your question or issue in detail..."
              rows={6}
              style={{ resize: 'vertical' }}
            />
          </div>

          <button type="submit" className="btn-primary">
            Send Message
          </button>
        </form>
      </div>

      <div className="data-section">
        <h2 className="section-header">Support Information</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
          <div>
            <h3 style={{ color: '#60a5fa', marginBottom: 8, fontSize: 16 }}>Email Support</h3>
            <p style={{ color: '#cbd5e1', lineHeight: 1.7 }}>
              support@aimanufacturingops.com
            </p>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
              Response within 24 hours
            </p>
          </div>

          <div>
            <h3 style={{ color: '#60a5fa', marginBottom: 8, fontSize: 16 }}>Phone Support</h3>
            <p style={{ color: '#cbd5e1', lineHeight: 1.7 }}>
              +1 (555) 123-4567
            </p>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
              Toll-free for enterprise customers
            </p>
          </div>

          <div>
            <h3 style={{ color: '#60a5fa', marginBottom: 8, fontSize: 16 }}>Business Hours</h3>
            <p style={{ color: '#cbd5e1', lineHeight: 1.7 }}>
              Monday - Friday: 8:00 AM - 6:00 PM EST
            </p>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
              Emergency support available 24/7
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Contact;

import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SalonHubLogo from '@/components/SalonHubLogo';

const Section = ({ n, title, children }) => (
  <section className="mb-8">
    <h2 className="text-lg font-semibold text-espresso mb-2">{n}. {title}</h2>
    <div className="space-y-3 text-[15px] leading-relaxed text-neutral-700">{children}</div>
  </section>
);

/**
 * Public Privacy Policy — SalonHub.in
 * Reachable at /privacy (linked from the login consent checkbox).
 */
export default function PrivacyPolicyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-neutral-200">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-espresso"
            data-testid="privacy-back-btn"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <SalonHubLogo size={34} showText />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10" data-testid="privacy-page">
        <h1 className="text-3xl font-bold text-espresso mb-1">Privacy Policy</h1>
        <p className="text-sm text-neutral-500 mb-8">SalonHub.in · Last updated July 2025</p>

        <p className="text-[15px] leading-relaxed text-neutral-700 mb-8">
          This Privacy Policy explains how <strong>SalonHub.in</strong> (&ldquo;SalonHub&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;),
          operator of the SalonHub platform and the SalonApp application available at{' '}
          <a href="https://salonhub.in/" target="_blank" rel="noopener noreferrer" className="text-brass font-medium hover:underline">salonhub.in</a>{' '}
          (the &ldquo;Service&rdquo;), collects, uses, shares, and protects personal data. By using the Service you agree to the practices described here.
        </p>

        <Section n={1} title="Who this policy covers">
          <p>The Service is used by two groups whose data we handle differently:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Salon businesses</strong> — the salons and their staff who hold an account and use SalonHub to manage bookings, queues, and customer messaging.</li>
            <li><strong>Salon customers</strong> — the end customers of those salons, whose booking and contact details are entered into or captured by the Service, and who may exchange messages with a salon over WhatsApp.</li>
          </ul>
          <p>For a salon&rsquo;s customer data, the salon determines how that data is used and acts as the primary data controller; SalonHub processes it to provide the Service to that salon.</p>
        </Section>

        <Section n={2} title="Information we collect">
          <p className="font-semibold text-espresso">From salon businesses</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Account and identity details: business name, owner/staff names, email address, phone number, and login credentials.</li>
            <li>Business profile details: services offered, working hours, location, staff roster, and settings.</li>
            <li>WhatsApp connection details: the WhatsApp Business Account and phone number identifiers you connect to the Service.</li>
          </ul>
          <p className="font-semibold text-espresso">From salon customers</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Contact details: name and phone number.</li>
            <li>Booking data: appointments, services requested, queue position, visit history, and preferences.</li>
            <li>Message content: WhatsApp messages exchanged between the customer and the salon through the Service, including booking confirmations, reminders, and chat.</li>
          </ul>
          <p className="font-semibold text-espresso">Automatically</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Technical and usage data: device and browser type, IP address, log data, and interactions with the Service, collected through standard logging and cookies.</li>
          </ul>
          <p className="font-semibold text-espresso">Payments</p>
          <p>SalonHub does not store full payment card numbers. Subscription payments to SalonHub are processed by our payment provider. Charges for WhatsApp messaging are billed by Meta directly to the salon&rsquo;s own WhatsApp Business Account payment method; SalonHub does not process those charges.</p>
        </Section>

        <Section n={3} title="How we use information">
          <ul className="list-disc pl-5 space-y-1">
            <li>To provide and operate the Service: bookings, live queue management, and the salon–customer messaging inbox.</li>
            <li>To send transactional WhatsApp messages on a salon&rsquo;s behalf, such as appointment confirmations and reminders, and to deliver two-way chat between a salon and its customers.</li>
            <li>To provide customer support and respond to requests.</li>
            <li>To maintain security, prevent abuse, and debug and improve the Service.</li>
            <li>To comply with legal obligations.</li>
          </ul>
        </Section>

        <Section n={4} title="WhatsApp Business Platform and Meta">
          <p>When a salon connects its WhatsApp Business number, messaging is delivered through the WhatsApp Business Platform provided by Meta Platforms, Inc. SalonHub acts as a technology provider that enables the salon to message its own customers. Message content and related metadata are processed by Meta in order to deliver messages, and Meta&rsquo;s handling of that data is governed by the{' '}
            <a href="https://www.whatsapp.com/legal/business-terms/" target="_blank" rel="noopener noreferrer" className="text-brass font-medium hover:underline">WhatsApp Business Terms</a>{' '}
            and Meta&rsquo;s applicable data policies. Each salon connects and owns its own WhatsApp Business Account; SalonHub is granted access only to operate messaging on that salon&rsquo;s behalf. We use information obtained through WhatsApp only to provide and improve the Service, and not for any purpose incompatible with this policy.</p>
        </Section>

        <Section n={5} title="How we share information">
          <p>We do not sell personal data. We share it only as follows:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Meta / WhatsApp Business Platform</strong> — to send and receive messages as described above.</li>
            <li><strong>Infrastructure and service providers</strong> — cloud hosting, database, analytics, and payment providers that process data under contract on our instructions.</li>
            <li><strong>The relevant salon</strong> — a customer&rsquo;s booking and message data is shared with the salon the customer is interacting with.</li>
            <li><strong>Legal and safety</strong> — where required by law, regulation, or valid legal process, or to protect rights, safety, and the integrity of the Service.</li>
            <li><strong>Business transfers</strong> — in connection with a merger, acquisition, or sale of assets, subject to this policy.</li>
          </ul>
        </Section>

        <Section n={6} title="Data retention">
          <p>We retain personal data for as long as an account is active or as needed to provide the Service, and thereafter only as required to meet legal, accounting, or reporting obligations, resolve disputes, and enforce agreements. Salons may request deletion of their account data, and customers may ask the relevant salon or us to delete their data, subject to those obligations.</p>
        </Section>

        <Section n={7} title="Data security">
          <p>We use reasonable technical and organisational measures, including encryption of data in transit and access controls, to protect personal data. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.</p>
        </Section>

        <Section n={8} title="Your rights">
          <p>Depending on your location and applicable law, including India&rsquo;s Digital Personal Data Protection Act, 2023, you may have the right to access, correct, update, or request deletion of your personal data, to withdraw consent, and to raise a grievance. To exercise these rights, contact us at{' '}
            <a href="mailto:rohit@salonhub.in" className="text-brass font-medium hover:underline">rohit@salonhub.in</a>. If you are a salon&rsquo;s customer, you may also contact the salon directly. We will respond within the timeframes required by applicable law.</p>
        </Section>

        <Section n={9} title="Children">
          <p>The Service is intended for businesses and their adult customers and is not directed to individuals under 18. We do not knowingly collect personal data from children. If you believe a child&rsquo;s data has been provided to us, contact us and we will take appropriate steps to remove it.</p>
        </Section>

        <Section n={10} title="International data transfers">
          <p>We and our service providers may process personal data in countries other than your own. Where we transfer data across borders, we take steps to ensure it remains protected in accordance with this policy and applicable law.</p>
        </Section>

        <Section n={11} title="Cookies">
          <p>We use cookies and similar technologies to keep you signed in, remember preferences, secure the Service, and understand usage. You can control cookies through your browser settings; disabling some cookies may affect how the Service works.</p>
        </Section>

        <Section n={12} title="Changes to this policy">
          <p>We may update this policy from time to time. When we do, we will revise the &ldquo;Last updated&rdquo; date above and, where appropriate, notify you. Continued use of the Service after changes take effect means you accept the updated policy.</p>
        </Section>

        <Section n={13} title="Data deletion">
          <p>You can request deletion of your personal data at any time.</p>
          <p className="font-semibold text-espresso">If you are a salon (account holder)</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Sign in to SalonHub and open <strong>Settings → Business profile</strong>.</li>
            <li>Choose <strong>Delete account</strong>, or email us from your registered email.</li>
            <li>We remove your account, business profile, staff records, customer records and connected WhatsApp configuration held by SalonHub.</li>
          </ol>
          <p className="font-semibold text-espresso">If you are a salon&rsquo;s customer</p>
          <p>Your booking and contact details are held on behalf of the salon you visited. Ask that salon to delete your details, or email us directly and we will action the request and coordinate with the salon.</p>
          <p className="font-semibold text-espresso">Request by email</p>
          <p>Email <a href="mailto:rohit@salonhub.in?subject=Data%20deletion%20request" className="text-brass font-medium hover:underline">rohit@salonhub.in</a> with the subject <strong>&ldquo;Data deletion request&rdquo;</strong>, from the email or phone number linked to your account or booking. Include your name and, if you are a customer, the salon you visited.</p>
          <p className="font-semibold text-espresso">What we delete and when</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>We delete the personal data we hold for you — account details, business profile, booking history, message records and connected WhatsApp configuration.</li>
            <li>Requests are actioned within 30 days of verification.</li>
            <li>We may retain limited data where required by law (e.g. tax/accounting records), only for as long as the law requires.</li>
          </ul>
        </Section>

        <Section n={14} title="Contact us">
          <p><strong>SalonHub.in</strong><br />India</p>
          <p>Email: <a href="mailto:rohit@salonhub.in" className="text-brass font-medium hover:underline">rohit@salonhub.in</a></p>
          <p>Grievance Officer: Rohit — <a href="mailto:rohit@salonhub.in" className="text-brass font-medium hover:underline">rohit@salonhub.in</a></p>
        </Section>

        <div className="border-t border-neutral-200 pt-6 text-center text-sm text-neutral-500">
          © {new Date().getFullYear()} SalonHub.in — all rights reserved.
        </div>
      </main>
    </div>
  );
}

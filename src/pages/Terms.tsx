import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Shield, Lock } from 'lucide-react';

export default function Terms() {
  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </Link>

      <div className="space-y-8">
        <div className="card p-8">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="h-6 w-6 text-primary-600" />
            <h1 className="font-display text-3xl text-neutral-900">Terms of Service</h1>
          </div>
          <div className="prose prose-sm max-w-none text-neutral-700 space-y-4">
            <p><strong>Last Updated:</strong> {new Date().toLocaleDateString()}</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">1. Acceptance of Terms</h3>
            <p>By accessing and using PharmaFlow, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using this service.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">2. Age Requirement</h3>
            <p>You must be at least 13 years old to use this service. By using PharmaFlow, you represent and warrant that you are at least 13 years old.</p>
            <p className="text-xs text-neutral-500 mt-2">*For Canadian users: In compliance with Canadian privacy laws, we do not knowingly collect personal information from individuals under 13 years of age without parental consent.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">3. Subscription Terms</h3>
            <p>PharmaFlow is offered as a subscription service. By subscribing, you agree to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Pay the monthly subscription fee as displayed at checkout (in Canadian dollars)</li>
              <li>Auto-renewal of your subscription on a monthly basis</li>
              <li>Cancel your subscription at any time through your account settings</li>
              <li>Continued billing until cancellation is processed</li>
            </ul>
            <p className="text-xs text-neutral-500 mt-2">*For Canadian users: Auto-renewal terms comply with Canadian consumer protection laws. You may cancel at any time with no penalty.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">4. Account Responsibilities</h3>
            <p>You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">5. Acceptable Use</h3>
            <p>You agree to use PharmaFlow only for lawful purposes and in accordance with these Terms. You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the service for any illegal purpose</li>
              <li>Violate any international, federal, provincial, or state regulations</li>
              <li>Infringe upon intellectual property rights</li>
              <li>Transmit malicious code or viruses</li>
            </ul>
            
            <h3 className="text-lg font-semibold text-neutral-900">6. Privacy Policy</h3>
            <p>Your use of PharmaFlow is also governed by our Privacy Policy, which describes how we collect, use, and protect your personal information.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">7. Termination</h3>
            <p>We reserve the right to terminate or suspend your account at any time for violation of these Terms or for any other reason at our sole discretion.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">8. Changes to Terms</h3>
            <p>We reserve the right to modify these terms at any time. Continued use of the service after changes constitutes acceptance of the modified terms.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">9. Intellectual Property</h3>
            <p>All content, features, and functionality of PharmaFlow are owned by us and are protected by international copyright, trademark, and other intellectual property laws. You may not reproduce, distribute, or create derivative works without our express written permission.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">10. Copyright Policy</h3>
            <p>PharmaFlow respects the intellectual property rights of others and complies with Canadian copyright law. If you believe your copyrighted work has been copied in a way that constitutes copyright infringement, please contact us with:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Your physical or electronic signature</li>
              <li>Identification of the copyrighted work claimed to have been infringed</li>
              <li>Identification of the material that is claimed to be infringing</li>
              <li>Your contact information</li>
              <li>A statement of good faith belief that the use is not authorized</li>
              <li>A statement that the information is accurate under penalty of perjury</li>
            </ul>
            <p className="text-xs text-neutral-500 mt-2">*In compliance with the Copyright Act (R.S.C., 1985, c. C-42) and related Canadian copyright legislation.</p>
          </div>
        </div>

        <div className="card p-8">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-6 w-6 text-primary-600" />
            <h1 className="font-display text-3xl text-neutral-900">Privacy Policy</h1>
          </div>
          <div className="prose prose-sm max-w-none text-neutral-700 space-y-4">
            <p><strong>Last Updated:</strong> {new Date().toLocaleDateString()}</p>
            <p className="text-xs text-neutral-500 mb-4">This Privacy Policy is designed to comply with Canada's Personal Information Protection and Electronic Documents Act (PIPEDA) and applicable provincial privacy legislation.</p>

            <h3 className="text-lg font-semibold text-neutral-900">1. Information We Collect</h3>
            <p>We collect information you provide directly, including:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Email address and contact information</li>
              <li>Pharmacy name and business information</li>
              <li>Account credentials</li>
              <li>Payment information (processed securely by Stripe)</li>
            </ul>
            <p className="text-xs text-neutral-500 mt-2">We collect only the personal information that is necessary for the purposes identified in this policy, in accordance with PIPEDA's principle of limited collection.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">2. How We Use Your Information</h3>
            <p>We use your information to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide and maintain our service</li>
              <li>Process payments and manage subscriptions</li>
              <li>Send important communications about your account</li>
              <li>Improve and develop our service</li>
              <li>Comply with legal obligations</li>
            </ul>
            
            <h3 className="text-lg font-semibold text-neutral-900">3. Data Security</h3>
            <p>We implement appropriate technical and organizational measures to protect your personal data, including encryption, secure servers, and access controls. However, no method of transmission over the internet is 100% secure.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">4. Data Retention</h3>
            <p>We retain your personal data only as long as necessary for the purposes outlined in this policy, unless required by law to retain it longer.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">5. Your Rights Under PIPEDA</h3>
            <p>Under Canadian privacy law, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access your personal data and know how it's being used</li>
              <li>Challenge the accuracy and completeness of your information</li>
              <li>Request correction of inaccurate data</li>
              <li>Withdraw consent for collection, use, or disclosure (where appropriate)</li>
              <li>File a complaint with us or with the Privacy Commissioner of Canada</li>
              <li>Request deletion of your data (subject to legal and operational requirements)</li>
            </ul>
            <p className="text-xs text-neutral-500 mt-2">These rights are guaranteed under PIPEDA and applicable provincial privacy laws. To exercise these rights, please contact us through your account settings.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">6. Third-Party Services</h3>
            <p>We use third-party services including:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Stripe:</strong> For payment processing</li>
              <li><strong>Supabase:</strong> For database and authentication services</li>
            </ul>
            <p>These services have their own privacy policies which we encourage you to review.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">7. Data Residency & Transfers</h3>
            <p><strong>Canadian Data Residency:</strong> Your personal information is primarily stored and processed within Canada. We prioritize keeping your data within Canadian borders to comply with PIPEDA and provincial privacy laws.</p>
            <p><strong>International Transfers:</strong> In limited circumstances, your information may be transferred to and processed in countries other than Canada (such as the United States for payment processing via Stripe). When this occurs, we ensure appropriate safeguards are in place to protect your data in accordance with PIPEDA requirements for cross-border data transfers.</p>
            <p className="text-xs text-neutral-500 mt-2">We use Supabase for database services and Stripe for payment processing. Please review their respective privacy policies for more information about their data handling practices.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">8. Children's Privacy</h3>
            <p>Our service is not intended for children under 13. We do not knowingly collect personal information from children under 13 without parental consent, in compliance with Canadian privacy legislation.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">9. Changes to This Policy</h3>
            <p>We may update our privacy policy from time to time. We will notify you of any changes by posting the new policy on this page.</p>
            
            <h3 className="text-lg font-semibold text-neutral-900">10. Data Breach Notification</h3>
            <p>In the unlikely event of a data breach involving your personal information, we will:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Notify you as soon as reasonably possible if there's a real risk of significant harm</li>
              <li>Provide information about the breach and steps you can take to protect yourself</li>
              <li>Report the breach to the Privacy Commissioner of Canada if required by law</li>
              <li>Take immediate steps to contain the breach and prevent further unauthorized access</li>
            </ul>
            <p className="text-xs text-neutral-500 mt-2">This policy complies with PIPEDA data breach notification requirements (Personal Information Protection and Electronic Documents Act, S.C. 2000, c. 5).</p>

            <h3 className="text-lg font-semibold text-neutral-900">11. Contact Us</h3>
            <p>If you have questions about this privacy policy, please contact us through your account settings or at the support contact information provided in the application.</p>
            <p className="text-xs text-neutral-500 mt-2"><strong>Canadian Support:</strong> For Canadian users, support is available during Canadian business hours (Eastern Time). We are committed to providing timely responses to privacy-related inquiries in accordance with PIPEDA requirements.</p>
          </div>
        </div>

        <div className="card p-8">
          <div className="flex items-center gap-3 mb-6">
            <Lock className="h-6 w-6 text-primary-600" />
            <h1 className="font-display text-3xl text-neutral-900">Canadian Consumer Protection & Auto-Renewal Terms</h1>
          </div>
          <div className="prose prose-sm max-w-none text-neutral-700 space-y-4">
            <p><strong>For Canadian Users:</strong></p>
            <p className="text-xs text-neutral-500 mb-4">These terms comply with Canadian consumer protection legislation, including the Competition Act and provincial consumer protection laws.</p>

            <h3 className="text-lg font-semibold text-neutral-900">Auto-Renewal Terms</h3>
            <p>By subscribing to PharmaFlow, you agree to the following auto-renewal terms:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Price:</strong> The subscription price will be clearly displayed at checkout in Canadian dollars</li>
              <li><strong>Duration:</strong> Subscriptions renew on a monthly basis</li>
              <li><strong>Cancellation:</strong> You may cancel at any time through your account settings</li>
              <li><strong>Cancellation Method:</strong> Go to Settings → Subscription → Cancel Subscription</li>
              <li><strong>Refund Policy:</strong> No refunds for partial months; service continues until end of billing period</li>
            </ul>

            <h3 className="text-lg font-semibold text-neutral-900">Your Rights Under Canadian Law</h3>
            <p>Under Canadian consumer protection law, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Cancel your auto-renewing subscription at any time</li>
              <li>Receive clear disclosure of all terms before purchase</li>
              <li>Receive confirmation of your subscription and renewal terms</li>
              <li>Easy cancellation with no penalty or additional fees</li>
              <li>Protection against unfair business practices</li>
            </ul>

            <h3 className="text-lg font-semibold text-neutral-900">Provincial Consumer Protection</h3>
            <p>Additional protections may apply depending on your province:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Ontario:</strong> Consumer Protection Act, 2002</li>
              <li><strong>Quebec:</strong> Consumer Protection Act (R.S.Q., c. P-40.1)</li>
              <li><strong>British Columbia:</strong> Business Practices and Consumer Protection Act</li>
              <li><strong>Alberta:</strong> Fair Trading Act</li>
            </ul>

            <h3 className="text-lg font-semibold text-neutral-900">Canadian Taxes</h3>
            <p><strong>GST/HST:</strong> Applicable Canadian sales taxes (GST, HST, or provincial sales tax) will be added to your subscription as required by law based on your location:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Ontario:</strong> 13% HST</li>
              <li><strong>Quebec:</strong> 5% GST + 9.975% QST</li>
              <li><strong>British Columbia:</strong> 5% GST + 7% PST</li>
              <li><strong>Alberta:</strong> 5% GST</li>
              <li><strong>Other provinces:</strong> Applicable GST/HST rates</li>
            </ul>
            <p className="text-xs text-neutral-500 mt-2">Tax rates are subject to change based on Canadian tax legislation. The final price including applicable taxes will be displayed at checkout.</p>

            <p className="text-sm text-neutral-600 mt-4">
              For questions about auto-renewal or cancellation, please contact support through your account settings.
            </p>
          </div>
        </div>

        <div className="card p-8">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-6 w-6 text-primary-600" />
            <h1 className="font-display text-3xl text-neutral-900">CASL (Canada's Anti-Spam Legislation) Compliance</h1>
          </div>
          <div className="prose prose-sm max-w-none text-neutral-700 space-y-4">
            <p><strong>For Canadian Users:</strong></p>
            <p className="text-xs text-neutral-500 mb-4">PharmaFlow complies with Canada's Anti-Spam Legislation (CASL), S.C. 2010, c. 23.</p>

            <h3 className="text-lg font-semibold text-neutral-900">Commercial Electronic Messages</h3>
            <p>We may send you commercial electronic messages (CEMs) including:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Account-related notifications and security alerts</li>
              <li>Service updates and feature announcements</li>
              <li>Subscription and billing information</li>
              <li>Administrative communications</li>
            </ul>

            <h3 className="text-lg font-semibold text-neutral-900">Consent</h3>
            <p>By creating an account and using PharmaFlow, you provide express consent to receive CEMs related to your account and subscription. You may withdraw consent at any time by:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Using the unsubscribe link in any electronic message</li>
              <li>Updating your communication preferences in account settings</li>
              <li>Contacting us directly through your account settings</li>
            </ul>

            <h3 className="text-lg font-semibold text-neutral-900">Identification Requirements</h3>
            <p>All CEMs we send will include:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Clear identification of the sender (PharmaFlow)</li>
              <li>Contact information for the sender</li>
              <li>A functioning unsubscribe mechanism</li>
            </ul>

            <p className="text-sm text-neutral-600 mt-4">
              For questions about our CASL compliance or to withdraw consent, please contact us through your account settings.
            </p>
          </div>
        </div>

        <div className="card p-8">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-6 w-6 text-primary-600" />
            <h1 className="font-display text-3xl text-neutral-900">Quebec French Language Requirements</h1>
          </div>
          <div className="prose prose-sm max-w-none text-neutral-700 space-y-4">
            <p><strong>For Quebec Users:</strong></p>
            <p className="text-xs text-neutral-500 mb-4">Information regarding Quebec's Charter of the French Language (Bill 101) compliance.</p>

            <h3 className="text-lg font-semibold text-neutral-900">French Language Services</h3>
            <p>PharmaFlow recognizes the importance of French language services for Quebec residents. We are committed to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Providing essential service information in French upon request</li>
              <li>Ensuring that contracts and terms can be provided in French</li>
              <li>Offering French language support for Quebec users</li>
            </ul>

            <h3 className="text-lg font-semibold text-neutral-900">Current Language Availability</h3>
            <p>Currently, PharmaFlow primarily operates in English. However, we provide:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>English interface with the ability to request French translations</li>
              <li>French language support for account setup and terms</li>
              <li>Bilingual customer service for Quebec residents</li>
            </ul>

            <h3 className="text-lg font-semibold text-neutral-900">Requesting French Services</h3>
            <p>Quebec users who require French language services may:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Contact support through their account settings</li>
              <li>Request French translations of terms and policies</li>
              <li>Access bilingual customer service representatives</li>
            </ul>

            <p className="text-sm text-neutral-600 mt-4">
              We are continuously working to improve our French language services to better serve our Quebec users.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
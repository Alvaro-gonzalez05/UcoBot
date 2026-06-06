export const metadata = {
  title: 'Términos de Servicio — UcoBot',
  description: 'Términos y condiciones del servicio UcoBot.',
}

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Términos de Servicio</h1>
        <p className="text-sm text-gray-500 mb-10">Última actualización: junio de 2026</p>

        <Section title="1. Datos del prestador del servicio">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 space-y-1">
            <p><span className="font-semibold">Responsable:</span> GONZALEZ VICARIO ALVARO SANTINO</p>
            <p><span className="font-semibold">CUIT:</span> 20-46866708-9</p>
            <p><span className="font-semibold">Nombre comercial:</span> Codea Desarrollos / UCOBot</p>
            <p><span className="font-semibold">Domicilio:</span> Loria Oeste 165, Gobernador Benegas, Mendoza, Argentina</p>
            <p><span className="font-semibold">Contacto:</span>{' '}
              <a href="mailto:desarrolloscodeade@gmail.com" className="text-blue-600 underline">desarrolloscodeade@gmail.com</a>
            </p>
          </div>
        </Section>

        <Section title="2. Aceptación de los términos">
          <p>
            Al registrarte y usar UcoBot, aceptás estos Términos de Servicio. Si no estás de acuerdo,
            no debés usar la plataforma. UcoBot es operado por <strong>Codea Desarrollos</strong>,
            Mendoza, Argentina.
          </p>
        </Section>

        <Section title="3. Descripción del servicio">
          <p>
            UcoBot es una plataforma SaaS que permite a negocios crear, configurar y gestionar chatbots
            con inteligencia artificial conectados a WhatsApp Business e Instagram mediante las APIs
            oficiales de Meta. Incluye funcionalidades de CRM, automatizaciones, gestión de clientes
            y análisis de conversaciones.
          </p>
        </Section>

        <Section title="4. Registro y cuenta">
          <ul className="list-disc pl-5 space-y-2">
            <li>Debés proveer información verdadera y actualizada al registrarte.</li>
            <li>Sos responsable de mantener la seguridad de tu contraseña.</li>
            <li>Notificá inmediatamente cualquier acceso no autorizado a tu cuenta.</li>
            <li>Una cuenta por negocio. No está permitida la reventa del acceso.</li>
          </ul>
        </Section>

        <Section title="5. Uso aceptable">
          <p>Te comprometés a no usar UcoBot para:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>Enviar spam, mensajes no solicitados o contenido engañoso.</li>
            <li>Violar las políticas de uso de las APIs de Meta.</li>
            <li>Actividades ilegales, fraudulentas o que vulneren derechos de terceros.</li>
            <li>Intentar acceder a cuentas o datos de otros usuarios.</li>
            <li>Distribuir malware o contenido dañino.</li>
          </ul>
        </Section>

        <Section title="6. Integración con Meta">
          <p>
            Al conectar tu cuenta de WhatsApp Business o Instagram, aceptás también las{' '}
            <a href="https://www.whatsapp.com/legal/business-policy/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
              Políticas de WhatsApp Business
            </a>{' '}
            y las{' '}
            <a href="https://developers.facebook.com/terms/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
              Condiciones de la Plataforma de Meta
            </a>.
            UcoBot actúa como intermediario técnico y no es responsable por restricciones impuestas
            directamente por Meta sobre tu cuenta.
          </p>
        </Section>

        <Section title="7. Planes y pagos">
          <ul className="list-disc pl-5 space-y-2">
            <li>Los precios y planes disponibles se detallan en la plataforma.</li>
            <li>Los pagos son en pesos argentinos (ARS) salvo indicación contraria.</li>
            <li>Los planes de suscripción se renuevan automáticamente salvo cancelación previa.</li>
            <li>No hay reembolsos por períodos ya abonados, excepto en casos de fallas graves del servicio.</li>
          </ul>
        </Section>

        <Section title="8. Propiedad intelectual">
          <p>
            Todo el software, diseño y contenido de UcoBot es propiedad de Codea Desarrollos.
            Los contenidos generados por vos (mensajes, configuraciones de bot) son de tu propiedad.
            Nos otorgás una licencia limitada para procesarlos con el único fin de prestar el servicio.
          </p>
        </Section>

        <Section title="9. Limitación de responsabilidad">
          <p>
            UcoBot se provee "tal como está". No garantizamos disponibilidad ininterrumpida. No somos
            responsables por pérdidas de negocio derivadas de interrupciones del servicio o de cambios
            en las políticas de Meta que afecten las integraciones.
          </p>
        </Section>

        <Section title="10. Terminación">
          <p>
            Podés cancelar tu cuenta en cualquier momento desde la configuración. Nos reservamos el
            derecho de suspender o terminar cuentas que violen estos términos, con o sin previo aviso.
          </p>
        </Section>

        <Section title="11. Modificaciones">
          <p>
            Podemos modificar estos términos. Te notificaremos con al menos 15 días de anticipación
            ante cambios sustanciales. Continuar usando el servicio implica aceptación de los nuevos términos.
          </p>
        </Section>

        <Section title="12. Ley aplicable">
          <p>
            Estos términos se rigen por las leyes de la República Argentina. Para cualquier controversia,
            las partes se someten a la jurisdicción de los tribunales ordinarios de la ciudad de Mendoza.
          </p>
        </Section>

        <Section title="13. Contacto">
          <p>
            Consultas:{' '}
            <a href="mailto:desarrolloscodeade@gmail.com" className="text-blue-600 underline">
              desarrolloscodeade@gmail.com
            </a>
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-gray-800 mb-3">{title}</h2>
      <div className="text-gray-600 leading-relaxed">{children}</div>
    </section>
  )
}

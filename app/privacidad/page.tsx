export const metadata = {
  title: 'Política de Privacidad — UcoBot',
  description: 'Política de privacidad de UcoBot, plataforma de chatbots inteligentes para negocios.',
}

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Política de Privacidad</h1>
        <p className="text-sm text-gray-500 mb-10">Última actualización: junio de 2026</p>

        <Section title="1. Responsable del tratamiento de datos">
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

        <Section title="2. Quiénes somos">
          <p>
            UcoBot es una plataforma SaaS desarrollada por <strong>Codea Desarrollos</strong>, con sede en
            Mendoza, Argentina. Ofrecemos soluciones de chatbot con inteligencia artificial para negocios que
            operan a través de WhatsApp e Instagram, conectando dichos canales mediante las APIs oficiales de Meta.
          </p>
        </Section>

        <Section title="3. Información que recopilamos">
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Datos de registro:</strong> nombre, correo electrónico y datos del negocio al crear una cuenta.</li>
            <li><strong>Datos de conversación:</strong> mensajes entre los usuarios finales y los chatbots configurados por nuestros clientes, procesados para brindar las respuestas automáticas.</li>
            <li><strong>Datos de uso:</strong> métricas de actividad dentro de la plataforma (sesiones, clicks, configuraciones).</li>
            <li><strong>Tokens de integración:</strong> credenciales de acceso a las APIs de Meta (WhatsApp Business, Instagram), almacenadas de forma cifrada.</li>
          </ul>
        </Section>

        <Section title="4. Cómo usamos la información">
          <ul className="list-disc pl-5 space-y-2">
            <li>Proveer, mantener y mejorar los servicios de UcoBot.</li>
            <li>Procesar y responder mensajes de los usuarios finales a través de los chatbots configurados.</li>
            <li>Enviar notificaciones de servicio, actualizaciones y soporte técnico.</li>
            <li>Analizar el uso de la plataforma de forma agregada y anónima para mejorar la experiencia.</li>
          </ul>
          <p className="mt-3">No vendemos ni compartimos datos personales con terceros con fines comerciales.</p>
        </Section>

        <Section title="5. Integración con Meta (WhatsApp e Instagram)">
          <p>
            UcoBot utiliza las APIs oficiales de Meta Platforms para enviar y recibir mensajes. Al conectar tu
            cuenta de WhatsApp Business o Instagram, autorizás a UcoBot a gestionar mensajes en tu nombre dentro
            del alcance que vos definís.
          </p>
          <p className="mt-3">
            Los datos intercambiados a través de estas integraciones están sujetos también a la{' '}
            <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
              Política de Privacidad de Meta
            </a>.
          </p>
        </Section>

        <Section title="6. Almacenamiento y seguridad">
          <p>
            Los datos se almacenan en servidores seguros provistos por Supabase (PostgreSQL) en la región de
            Sudamérica. Aplicamos cifrado en tránsito (TLS) y en reposo para los datos sensibles. El acceso está
            restringido mediante autenticación y control de roles.
          </p>
        </Section>

        <Section title="7. Retención de datos">
          <p>
            Conservamos los datos de las conversaciones mientras la cuenta esté activa. Al cancelar la cuenta,
            los datos pueden ser eliminados a solicitud del titular. Ver la sección de{' '}
            <a href="/eliminacion-datos" className="text-blue-600 underline">eliminación de datos</a>.
          </p>
        </Section>

        <Section title="8. Derechos del usuario">
          <p>Podés solicitar en cualquier momento:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Acceso a tus datos personales.</li>
            <li>Corrección de datos incorrectos.</li>
            <li>Eliminación de tu cuenta y datos asociados.</li>
            <li>Portabilidad de tus datos.</li>
          </ul>
          <p className="mt-3">
            Para ejercer estos derechos, enviá un correo a{' '}
            <a href="mailto:desarrolloscodeade@gmail.com" className="text-blue-600 underline">desarrolloscodeade@gmail.com</a>.
          </p>
        </Section>

        <Section title="9. Cookies">
          <p>
            Usamos cookies de sesión necesarias para el funcionamiento de la plataforma y cookies de analítica
            (Vercel Analytics) de forma anónima. No utilizamos cookies de seguimiento de terceros con fines
            publicitarios.
          </p>
        </Section>

        <Section title="10. Cambios a esta política">
          <p>
            Podemos actualizar esta política periódicamente. Notificaremos los cambios significativos por correo
            electrónico o mediante un aviso destacado en la plataforma.
          </p>
        </Section>

        <Section title="11. Contacto">
          <p>
            Para consultas sobre privacidad contactanos en:{' '}
            <a href="mailto:desarrolloscodeade@gmail.com" className="text-blue-600 underline">desarrolloscodeade@gmail.com</a>
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

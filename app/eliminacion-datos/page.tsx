export const metadata = {
  title: 'Eliminación de Datos — UcoBot',
  description: 'Instrucciones para solicitar la eliminación de tus datos en UcoBot.',
}

export default function EliminacionDatosPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Eliminación de Datos de Usuario</h1>
        <p className="text-sm text-gray-500 mb-10">Última actualización: junio de 2026</p>

        <Section title="Responsable del tratamiento de datos">
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

        <p className="text-gray-600 leading-relaxed mb-10">
          En UcoBot respetamos tu derecho a la privacidad y al control de tus datos personales.
          Si utilizaste UcoBot a través de una integración con Meta (WhatsApp o Instagram) o
          creaste una cuenta directamente en nuestra plataforma, podés solicitar la eliminación
          de todos tus datos en cualquier momento.
        </p>

        <Section title="¿Qué datos eliminamos?">
          <ul className="list-disc pl-5 space-y-2">
            <li>Tu cuenta y perfil de usuario.</li>
            <li>Historial de conversaciones asociado a tu número o cuenta.</li>
            <li>Configuraciones de bots y automatizaciones.</li>
            <li>Datos de clientes (CRM) que hayas registrado.</li>
            <li>Tokens y credenciales de integración con Meta.</li>
            <li>Datos de facturación (mantenemos registros contables mínimos por obligación legal por 5 años).</li>
          </ul>
        </Section>

        <Section title="Cómo solicitar la eliminación">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4">
            <div>
              <p className="font-semibold text-gray-800 mb-1">Opción 1 — Por correo electrónico</p>
              <p>
                Enviá un correo a{' '}
                <a href="mailto:desarrolloscodeade@gmail.com?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos" className="text-blue-600 underline">
                  desarrolloscodeade@gmail.com
                </a>{' '}
                con el asunto <strong>"Solicitud de eliminación de datos"</strong> e incluí:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-600">
                <li>Tu correo electrónico registrado en UcoBot.</li>
                <li>Tu número de WhatsApp si conectaste un canal.</li>
                <li>Confirmación de que deseás eliminar todos tus datos.</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-800 mb-1">Opción 2 — Desde tu cuenta</p>
              <p>
                Si tenés acceso a tu cuenta, podés cancelarla desde{' '}
                <a href="/dashboard/configuracion" className="text-blue-600 underline">Configuración → Cuenta</a>.
                Al confirmar la cancelación, tus datos serán eliminados en un plazo de 30 días.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Plazos">
          <ul className="list-disc pl-5 space-y-2">
            <li>Confirmamos la recepción de tu solicitud dentro de las <strong>48 horas hábiles</strong>.</li>
            <li>La eliminación completa se procesa en un plazo máximo de <strong>30 días</strong>.</li>
            <li>Recibirás un correo de confirmación cuando el proceso esté finalizado.</li>
          </ul>
        </Section>

        <Section title="Conexión con Meta">
          <p>
            Si llegaste a UcoBot a través de una app o integración de Meta, podés también revocar
            los permisos desde tu configuración de Facebook/Instagram en{' '}
            <a href="https://www.facebook.com/settings?tab=applications" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
              Configuración de Apps de Facebook
            </a>.
            Revocar el acceso desde Meta no elimina automáticamente los datos almacenados en UcoBot,
            por lo que igualmente recomendamos enviar una solicitud directa.
          </p>
        </Section>

        <Section title="Contacto">
          <p>
            Para cualquier consulta sobre tus datos personales:{' '}
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

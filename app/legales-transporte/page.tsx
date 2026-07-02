export const metadata = {
  title: 'Términos y Tratamiento de Datos — UcoBot Transporte',
  description: 'Términos de servicio y política de tratamiento de datos del kit de transporte internacional de UcoBot (Codea Desarrollos).',
}

export default function LegalesTransportePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Términos de Servicio y Tratamiento de Datos</h1>
        <p className="text-lg text-gray-600 mb-1">UcoBot Transporte — Kit para transporte internacional de cargas</p>
        <p className="text-sm text-gray-500 mb-10">Última actualización: julio de 2026</p>

        <Section title="1. Responsable del servicio y del tratamiento de datos">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 space-y-1">
            <p><span className="font-semibold">Responsable:</span> GONZALEZ VICARIO ALVARO SANTINO</p>
            <p><span className="font-semibold">CUIT:</span> 20-46866708-9</p>
            <p><span className="font-semibold">Nombre comercial:</span> Codea Desarrollos / UcoBot</p>
            <p><span className="font-semibold">Domicilio:</span> Loria Oeste 165, Gobernador Benegas, Mendoza, Argentina</p>
            <p><span className="font-semibold">Contacto:</span>{' '}
              <a href="mailto:desarrolloscodeade@gmail.com" className="text-blue-600 underline">desarrolloscodeade@gmail.com</a>
            </p>
          </div>
        </Section>

        <Section title="2. Objeto del servicio">
          <p>
            UcoBot Transporte es una plataforma SaaS desarrollada por <strong>Codea Desarrollos</strong> que asiste
            a empresas de transporte internacional de cargas y a Agentes de Transporte Aduanero (ATA) en la gestión
            de su operación: administración de flota, conductores, clientes de comercio exterior y rutas, extracción
            automatizada de datos de documentación de exportación mediante inteligencia artificial, y preparación de
            la información necesaria para el Manifiesto Internacional de Carga / Declaración de Tránsito Aduanero
            (MIC/DTA) y la Carta de Porte Internacional (CRT).
          </p>
        </Section>

        <Section title="3. Naturaleza de la herramienta y responsabilidad profesional">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              UcoBot Transporte es una <strong>herramienta de asistencia a la carga de datos</strong>. No reemplaza,
              no intermedia ni altera los sistemas oficiales de ARCA-AFIP (Sistema MALVINA / SINTIA).
            </li>
            <li>
              El sistema <strong>nunca oficializa ni presenta declaraciones</strong>. La revisión final y la
              oficialización de toda declaración jurada corresponden exclusivamente al profesional habilitado
              (ATA o declarante), quien conserva íntegramente su responsabilidad legal.
            </li>
            <li>
              La extensión de navegador opera <strong>dentro de la sesión que el propio usuario inicia con su Clave
              Fiscal</strong>, a modo de autocompletado de formularios. UcoBot <strong>no almacena, solicita ni
              gestiona credenciales de ARCA-AFIP</strong> en ningún caso.
            </li>
            <li>
              Las validaciones del sistema (coherencia de documentos, pesos, vigencias) son <strong>asistivas</strong>:
              contribuyen a reducir errores, pero no sustituyen el control profesional del declarante.
            </li>
            <li>
              Toda acción queda registrada con trazabilidad (usuario, fecha y operación).
            </li>
          </ul>
        </Section>

        <Section title="4. Información que se procesa">
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Datos de la cuenta:</strong> razón social, CUIT, datos de contacto del cliente del servicio.</li>
            <li><strong>Datos operativos del transportista:</strong> flota (patentes, chasis, pólizas), conductores (nombre y documento), permisos y habilitaciones, rutas habituales.</li>
            <li><strong>Documentación de operaciones:</strong> permisos de embarque, facturas de exportación y proformas que el cliente sube a la plataforma, y los datos que de ellos se extraen (exportador, consignatario, destinatario, mercadería, pesos, valores).</li>
            <li><strong>Datos de uso:</strong> métricas de actividad dentro de la plataforma.</li>
          </ul>
          <p className="mt-3">
            La solicitud de factura o proforma se realiza <strong>únicamente dentro de la plataforma</strong> y con el
            fin de completar datos que el permiso de embarque no contiene (por ejemplo, el consignatario del exterior).
            No agrega pasos ni documentos al trámite aduanero oficial.
          </p>
        </Section>

        <Section title="5. Procesamiento con inteligencia artificial">
          <ul className="list-disc pl-5 space-y-2">
            <li>Los documentos PDF se procesan con modelos de IA <strong>exclusivamente para extraer los datos de esa operación</strong>.</li>
            <li>Se utilizan APIs de proveedores cuyos términos establecen que los datos enviados <strong>no se utilizan para entrenar modelos</strong>.</li>
            <li>Todo dato extraído queda sujeto a <strong>revisión humana</strong> antes de su uso en una declaración.</li>
          </ul>
        </Section>

        <Section title="6. Aislamiento y propiedad de los datos">
          <ul className="list-disc pl-5 space-y-2">
            <li>Los datos de cada cuenta están <strong>aislados a nivel de base de datos</strong> (arquitectura multi-tenant con políticas de acceso por fila). Ninguna cuenta puede acceder a los datos de otra.</li>
            <li>Los datos cargados <strong>pertenecen al cliente</strong>. Codea Desarrollos no los vende, no los comparte con terceros y no utiliza los datos de un cliente en beneficio de otro.</li>
            <li>El cliente puede solicitar la <strong>exportación o eliminación</strong> de sus datos en cualquier momento (ver <a href="/eliminacion-datos" className="text-blue-600 underline">eliminación de datos</a>).</li>
          </ul>
        </Section>

        <Section title="7. Seguridad y almacenamiento">
          <p>
            Los datos se almacenan en servidores seguros provistos por Supabase (PostgreSQL) en la región de
            Sudamérica. Se aplica cifrado en tránsito (TLS) y en reposo. El acceso está restringido mediante
            autenticación y control de roles. Se realizan copias de seguridad periódicas.
          </p>
        </Section>

        <Section title="8. Marco normativo">
          <p>
            El tratamiento de datos personales se rige por la <strong>Ley 25.326 de Protección de Datos
            Personales</strong> de la República Argentina y su normativa complementaria. El titular de los datos
            puede ejercer sus derechos de acceso, rectificación, actualización y supresión escribiendo a{' '}
            <a href="mailto:desarrolloscodeade@gmail.com" className="text-blue-600 underline">desarrolloscodeade@gmail.com</a>.
            La Agencia de Acceso a la Información Pública (AAIP) es el órgano de control de dicha ley.
          </p>
        </Section>

        <Section title="9. Limitación de responsabilidad">
          <p>
            La exactitud y veracidad final de toda declaración presentada ante el servicio aduanero corresponde al
            declarante. UcoBot Transporte provee asistencia de carga, validaciones automáticas y trazabilidad, pero
            no asume responsabilidad por el contenido de las declaraciones oficializadas por el usuario. El servicio
            se presta con los máximos estándares razonables de disponibilidad y se compromete a la adaptación de la
            herramienta ante cambios normativos u operativos de los sistemas oficiales.
          </p>
        </Section>

        <Section title="10. Acuerdos de confidencialidad y auditoría">
          <p>
            Codea Desarrollos ofrece la firma de <strong>acuerdos de confidencialidad (NDA)</strong> con clientes e
            instituciones, y pone a disposición instancias de <strong>auditoría de procesos y seguridad</strong>
            (arquitectura, aislamiento de datos, tratamiento con IA) sin exposición de datos de clientes, así como
            entornos de demostración con datos ficticios.
          </p>
        </Section>

        <Section title="11. Cambios y contacto">
          <p>
            Estos términos pueden actualizarse periódicamente; los cambios significativos se notificarán por correo
            o mediante aviso en la plataforma. Consultas:{' '}
            <a href="mailto:desarrolloscodeade@gmail.com" className="text-blue-600 underline">desarrolloscodeade@gmail.com</a>.
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

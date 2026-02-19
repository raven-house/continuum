 1. Codegen Entry Point

  // From codegen.ts
  export async function generateCode(outputPath: string, fileOrDirPath: string, opts: GenerateCodeOptions = {}) {
    // Reads ABI JSON file
    const file = await readFile(noirAbiPath, 'utf8');
    const contract = JSON.parse(file);

    // Loads contract artifact (transforms Noir output to Aztec format)
    const aztecAbi = loadContractArtifact(contract);

    // Generates TypeScript interface
    const tsWrapper = await generateTypescriptContractInterface(aztecAbi, relativeArtifactPath);

    // Writes output file
    await writeFile(outputFilePath, tsWrapper);
  }

  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  2. The generateEvents() Function (Key Logic)

  This is the core function that generates the get events() output:

  // From typescript.ts (lines 235-282)
  async function generateEvents(events: any[] | undefined) {
    if (events === undefined) {
      return { events: '', eventDefs: '' };
    }

    const eventsMetadata = await Promise.all(
      events.map(async event => {
        // Extract event name from path (e.g., "my_contract::MyEvent" -> "MyEvent")
        const eventName = event.path.split('::').at(-1);

        // Generate TypeScript type definition for the event
        const eventDefProps = event.fields.map(
          (field: ABIVariable) => `${field.name}: ${abiTypeToTypescript(field.type)}`,
        );
        const eventDef = `
        export type ${eventName} = {
          ${eventDefProps.join('\n')}
        }
      `;

        // Extract field names
        const fieldNames = event.fields.map((field: any) => `"${field.name}"`);

        // Generate event type signature for the getter
        const eventType = `${eventName}: {abiType: AbiType, eventSelector: EventSelector, fieldNames: string[] }`;

        // Compute event signature and selector
        // Reuses decodeFunctionSignature for event signature computation
        const eventSignature = decodeFunctionSignature(eventName, event.fields);
        const eventSelector = await EventSelector.fromSignature(eventSignature);

        // Generate implementation
        const eventImpl = `${eventName}: {
          abiType: ${JSON.stringify(event, null, 4)},
          eventSelector: EventSelector.fromString("${eventSelector}"),
          fieldNames: [${fieldNames}],
        }`;

        return {
          eventDef,
          eventType,
          eventImpl,
        };
      }),
    );

    return {
      eventDefs: eventsMetadata.map(({ eventDef }) => eventDef).join('\n'),
      events: `
      public static get events(): { ${eventsMetadata.map(({ eventType }) => eventType).join(', ')} } {
      return {
        ${eventsMetadata.map(({ eventImpl }) => eventImpl).join(',\n')}
      };
    }
    `,
    };
  }

  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  3. Event Selector Computation

  The event selector is computed from the event signature:

  // From event_selector.ts
  export class EventSelector extends Selector {
    static async fromSignature(signature: string) {
      // Signature cannot contain whitespace
      if (/\s/.test(signature)) {
        throw new Error('Signature cannot contain whitespace');
      }

      // Hash the signature using Poseidon2
      const hash = await poseidon2HashBytes(Buffer.from(signature));

      // Take the last 4 bytes (Selector.SIZE = 4)
      const bytes = hash.toBuffer().slice(-Selector.SIZE);
      return EventSelector.fromBuffer(bytes);
    }
  }

  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  4. Signature Generation

  The event signature format is generated using:

  // From decoder.ts (FunctionSignatureDecoder)
  export function decodeFunctionSignature(name: string, parameters: ABIParameter[]) {
    return new FunctionSignatureDecoder(name, parameters).decode();
  }

  // The signature format is: EventName(param1Type,param2Type,...)
  // Examples:
  // - "TestEvent(Field)"
  // - "MyEvent(u32,AztecAddress)"
  // - "NestedEvent((Field,u32),[Field;5])"  // nested struct, array

  Type mapping in signature:

   Noir Type            Signature Format
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Field                Field
   u8, u32, u64, etc.   u8, u32, u64
   i8, i32, etc.        i8, i32
   bool                 bool
   str<N>               str<N>
   [T; N]               [ElementType;N]
   Struct               (field1Type,field2Type)
   Tuple                (type1,type2)

  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Complete ABI to get events() Data Flow

 
  // Pseudo-code for replicating get events() output
  async function calculateEventsOutput(abiJson: any) {
    // Step 1: Load contract artifact (transforms Noir ABI to Aztec format)
    const artifact = loadContractArtifact(abiJson);

    // Step 2: Get events from outputs.structs.events
    const events = artifact.outputs.structs?.events;

    // Step 3: For each event, compute metadata
    const result = await Promise.all(events.map(async (event) => {
      const eventName = event.path.split('::').pop();

      // Generate event signature (same format as Noir)
      const eventSignature = generateEventSignature(eventName, event.fields);
      // Example: "TestEvent(Field)"

      // Compute event selector using Poseidon2 hash
      const eventSelector = await computeEventSelector(eventSignature);
      // Takes last 4 bytes of Poseidon2 hash

      return {
        name: eventName,
        eventSelector: eventSelector.toString(), // e.g., "0x12345678"
        abiType: event, // Full AbiType structure
        fieldNames: event.fields.map(f => f.name),
      };
    }));

    return result;
  }

  // Signature generation (matching Noir's signature_of_type)
  function generateEventSignature(name: string, fields: ABIVariable[]): string {
    const paramTypes = fields.map(f => abiTypeToSignatureType(f.type));
    return `${name}(${paramTypes.join(',')})`;
  }

  // Type to signature string conversion
  function abiTypeToSignatureType(type: AbiType): string {
    switch (type.kind) {
      case 'field': return 'Field';
      case 'boolean': return 'bool';
      case 'integer': return type.sign === 'signed' ? `i${type.width}` : `u${type.width}`;
      case 'string': return `str<${type.length}>`;
      case 'array': return `[${abiTypeToSignatureType(type.type)};${type.length}]`;
      case 'struct': return `(${type.fields.map(f => abiTypeToSignatureType(f.type)).join(',')})`;
      case 'tuple': return `(${type.fields.map(abiTypeToSignatureType).join(',')})`;
    }
  }

  // Event selector computation using Poseidon2
  async function computeEventSelector(signature: string): Promise<string> {
    const hash = await poseidon2HashBytes(Buffer.from(signature));
    const selectorBytes = hash.toBuffer().slice(-4); // Last 4 bytes
    return '0x' + selectorBytes.toString('hex');
  }

  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  6. Event Source in ABI

  Events come from the outputs.structs.events array in the contract artifact (see abi.ts lines 337-339 and typescript.ts line 301):

  // From ContractArtifact interface (abi.ts)
  interface ContractArtifact {
    // ...
    outputs: {
      structs: Record<string, AbiType[]>;  // events are in structs.events
      globals: Record<string, AbiValue[]>;
    };
  }

  Each event in outputs.structs.events has this structure (from AbiType):

  {
    kind: 'struct',
    path: 'contract_name::EventName',  // Fully qualified path
    fields: [
      { name: 'field1', type: { kind: 'field' } },
      { name: 'field2', type: { kind: 'integer', sign: 'unsigned', width: 32 } },
      // ...
    ]
  }

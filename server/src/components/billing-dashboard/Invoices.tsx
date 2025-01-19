'use client'
import React, { useState, useEffect } from 'react';
import { FileTextIcon, GearIcon } from '@radix-ui/react-icons';
import { fetchAllInvoices, getInvoiceTemplates, getInvoiceLineItems } from '@/lib/actions/invoiceActions';
import { getAllCompanies } from '@/lib/actions/companyActions';
import { getServices } from '@/lib/actions/serviceActions';
import { InvoiceViewModel, IInvoiceTemplate } from '@/interfaces/invoice.interfaces';
import TemplateRenderer from './TemplateRenderer';
import PaperInvoice from './PaperInvoice';
import CustomSelect from '@/components/ui/CustomSelect';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { ColumnDefinition } from '@/interfaces/dataTable.interfaces';
import ManualInvoices from './ManualInvoices';
import { ICompany } from '@/interfaces';
import { IService } from '@/interfaces/billing.interfaces';

interface ServiceWithRate extends Pick<IService, 'service_id' | 'service_name'> {
  rate: number;
}

const Invoices: React.FC = () => {
  const [invoices, setInvoices] = useState<InvoiceViewModel[]>([]);
  const [templates, setTemplates] = useState<IInvoiceTemplate[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceViewModel | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<IInvoiceTemplate | null>(null);
  const [managingInvoice, setManagingInvoice] = useState<InvoiceViewModel | null>(null);
  const [companies, setCompanies] = useState<ICompany[]>([]);
  const [services, setServices] = useState<ServiceWithRate[]>([]);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);

  const loadData = async () => {
    try {
      const [
        fetchedInvoices,
        fetchedTemplates,
        fetchedCompanies,
        fetchedServices
      ] = await Promise.all([
        fetchAllInvoices(),
        getInvoiceTemplates(),
        getAllCompanies(false), // false to get only active companies
        getServices()
      ]);

      setInvoices(fetchedInvoices);
      setTemplates(fetchedTemplates);
      setCompanies(fetchedCompanies);
      setServices(fetchedServices.map((service): ServiceWithRate => ({
        service_id: service.service_id,
        service_name: service.service_name,
        rate: service.default_rate
      })));
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInvoiceSelect = (invoice: InvoiceViewModel) => {
    setSelectedInvoice(invoice);
    if (templates.length > 0) {
      setSelectedTemplate(templates[0]);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.template_id === templateId);
    setSelectedTemplate(template || null);
  };

  const handleManageItemsClick = async (invoice: InvoiceViewModel) => {
      try {
        setLoadingItems(true);
        const items = await getInvoiceLineItems(invoice.invoice_id);
        // Create new invoice object with fetched items
        const invoiceWithItems = {
          ...invoice,
          invoice_items: items
        };
        setManagingInvoice(invoiceWithItems);
        setSelectedInvoice(null);
        setSelectedTemplate(null);
      } catch (error) {
        console.error('Error loading invoice items:', error);
      } finally {
        setLoadingItems(false);
      }
  };

  const columns: ColumnDefinition<InvoiceViewModel>[] = [
    {
      title: 'Invoice Number',
      dataIndex: 'invoice_number',
    },
    {
      title: 'Company',
      dataIndex: ['company', 'name'],
    },
    {
      title: 'Amount',
      dataIndex: 'total',
      render: (value) => {
        // Convert cents to dollars and handle potential null/undefined
        const amount = typeof value === 'number' ? value / 100 : 0;
        return `$${amount.toFixed(2)}`;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
    },
    {
      title: 'Date',
      dataIndex: 'invoice_date',
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      title: 'Action',
      dataIndex: 'invoice_number',
      render: (_, record) => (
        <div className="flex gap-2">
          <Button
            id="view-invoice-button"
            onClick={() => handleInvoiceSelect(record)}
          >
            View
          </Button>
          <Button
            id="manage-items-button"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              handleManageItemsClick(record);
            }}
          >
            {record.is_manual ? 'Manage Items' : 'Manage Manual Items'}
          </Button>
        </div>
      ),
    },
  ];

  if (managingInvoice) {
    return (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">
            {managingInvoice.is_manual 
              ? `Manage Items - Invoice ${managingInvoice.invoice_number}`
              : `Manage Manual Items - Invoice ${managingInvoice.invoice_number}`}
          </h2>
          <Button
            id="cancel-manage-items-button"
            variant="ghost"
            onClick={() => setManagingInvoice(null)}
          >
            Cancel
          </Button>
        </div>
        <ManualInvoices
          companies={companies}
          services={services}
          invoice={managingInvoice}
          loading={loadingItems}
          onGenerateSuccess={() => {
            setManagingInvoice(null);
            loadData();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Invoices</h2>
      <DataTable
        data={invoices}
        columns={columns}
        pagination={true}
        onRowClick={handleInvoiceSelect}
      />

      {selectedInvoice && (
        <div className="mt-8">
          <h3 className="text-xl font-semibold mb-4">Select Template</h3>
          <CustomSelect
            options={templates.map((template): { value: string; label: JSX.Element } => ({
              value: template.template_id,
              label: (
                <div className="flex items-center gap-2">
                  {template.isStandard ? (
                    <><FileTextIcon className="w-4 h-4" /> {template.name} (Standard)</>
                  ) : (
                    <><GearIcon className="w-4 h-4" /> {template.name}</>
                  )}
                </div>
              )
            }))}
            onValueChange={handleTemplateSelect}
            value={selectedTemplate?.template_id || ''}
            placeholder="Select invoice template..."
          />
        </div>
      )}

      {selectedInvoice && selectedTemplate && (
        <div className="mt-8">
          <h3 className="text-xl font-semibold mb-4">Invoice Preview</h3>
          <PaperInvoice>
            <TemplateRenderer
              template={selectedTemplate}
              invoiceData={selectedInvoice}
            />
          </PaperInvoice>
        </div>
      )}
    </div>
  );
};

export default Invoices;

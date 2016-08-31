#!/usr/bin/perl

use JSON;
use strict;

my $od = "/DATA/KAPUTAR_4/ste616/data_reduction/C2914/datarelease";

# We look for high defects and remove that source from that epoch.

# Begin by making a backup file.
my $catname = $od."/datarelease_catalogue.json";
my $bakname = $catname.".bak";

print "Creating backup catalogue file $bakname...\n";
print "cp $catname $bakname\n";
system "cp $catname $bakname";

print "Reading catalogue...\n";
my $json = JSON->new;
my $catalogue;
if (-e $catname) {
    open(C, $catname);
    my $cattxt = <C>;
    close(C);
    $catalogue = from_json $cattxt;
} else {
    die "Can't open file $catname\n";
}

my @epelems = ( "closurePhase", "declination", "defect", "epochs",
		"fluxDensity", "fluxDensityFit", "hourAngle", "mjd",
		"rightAscension", "arrayConfigurations", "solarAngles" );

foreach my $s (keys $catalogue) {
    print "Analysing source $s\n";
    my $defs = $catalogue->{$s}->{'defect'};
    my @remove_indices;
    for (my $i = 0; $i <= $#{$defs}; $i++) {
	if ($defs->[$i] >= 100) {
	    # We remove this element.
	    push @remove_indices, $i;
	}
    }
    
    # And kill those indices.
    for (my $i = 0; $i <= $#remove_indices; $i++) {
	my $ri = $remove_indices[$i] - $i;
	print " removing epoch ".$catalogue->{$s}->{'epochs'}->[$ri]."...\n";
	for (my $j = 0; $j <= $#epelems; $j++) {
	    print "  removing $epelems[$j] value ".
		$catalogue->{$s}->{$epelems[$j]}->[$ri]."\n";
	    splice $catalogue->{$s}->{$epelems[$j]}, $ri, 1;
	}
    }
}

# Write the JSON out again.
print "Writing out the catalogue...\n";
open(C, ">".$catname);
print C to_json $catalogue;
close(C);

print "High defects removed.\n";
